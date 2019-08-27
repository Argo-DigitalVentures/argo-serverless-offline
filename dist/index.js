"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var good = require("@hapi/good");
var Hapi = require("@hapi/hapi");
var blipp = require("blipp");
var _ = require("lodash");
var Serverless = require("serverless");
var createLambdaContext_1 = require("./createLambdaContext");
var createLambdaProxyContext_1 = require("./createLambdaProxyContext");
var delegatedAuthScheme_1 = require("./delegatedAuthScheme");
var snsReader_1 = require("./snsReader");
var sqsReader_1 = require("./sqsReader");
var streamReader_1 = require("./streamReader");
var utils_1 = require("./utils");
var stream = new streamReader_1.StreamReader({ interval: Number(process.env.STREAM_READER_INTERVAL) });
var sns = new snsReader_1.SnsReader({ interval: Number(process.env.SNS_READER_INTERVAL) });
var sqs = new sqsReader_1.SqsReader({ interval: Number(process.env.SQS_READER_INTERVAL) });
var serverlessOptions = { stage: process.env.STAGE || 'ci' };
var requireLambdaModule = function (modulePath) { return require(process.cwd() + "/" + modulePath); };
var parseFunctionPath = function (path) {
    var handlerPathSegments = path.split('.');
    var functionName = handlerPathSegments[handlerPathSegments.length - 1];
    handlerPathSegments.pop();
    var modulePath = handlerPathSegments.join('.');
    return {
        functionName: functionName,
        modulePath: modulePath
    };
};
var getHandler = function (descriptor) {
    var handlerDescriptor = parseFunctionPath(descriptor.handler);
    var handlerModule = requireLambdaModule(handlerDescriptor.modulePath);
    return handlerModule[handlerDescriptor.functionName];
};
var registerAuthSchemes = function (service, server) {
    var authorizersMap = {};
    Object.keys(service.functions).forEach(function (functionName) {
        var descriptor = service.functions[functionName];
        if (!descriptor.events) {
            return;
        }
        descriptor.events.forEach(function (event) {
            if (event.http && event.http.authorizer) {
                authorizersMap[event.http.authorizer] = true;
            }
        });
    });
    Object.keys(authorizersMap).forEach(function (functionName) {
        var handler = getHandler(service.functions[functionName]);
        var scheme = function () {
            var authorizerOptions = {
                identitySource: 'method.request.header.Authorization',
                identityValidationExpression: '(.*)',
                name: functionName,
                resultTtlInSeconds: '300'
            };
            return delegatedAuthScheme_1.default(handler, authorizerOptions, serverlessOptions);
        };
        server.auth.scheme(functionName, scheme);
        server.auth.strategy(functionName, functionName);
    });
};
var registerStreams = function (service) {
    Object.keys(service.functions).forEach(function (functionName) {
        var descriptor = service.functions[functionName];
        if (!descriptor.events) {
            return;
        }
        descriptor.events.forEach(function (event) {
            if (event.stream) {
                stream.registerHandler(event.stream, getHandler(descriptor), functionName);
                return;
            }
        });
    });
};
var registerSNSEvents = function (service) {
    Object.keys(service.functions).forEach(function (functionName) {
        var descriptor = service.functions[functionName];
        if (!descriptor.events) {
            return;
        }
        descriptor.events.forEach(function (event) {
            if (event.sns) {
                sns.registerHandler(event.sns, getHandler(descriptor), functionName);
                sns.connect();
                return;
            }
        });
    });
};
var registerSQSEvents = function (service) {
    Object.keys(service.functions).forEach(function (functionName) {
        var descriptor = service.functions[functionName];
        if (descriptor.events && descriptor.events.length) {
            descriptor.events.forEach(function (event) { return event.sqs && sqs.registerHandler(event, getHandler(descriptor), functionName); });
        }
    });
};
var preProcessRequest = function (request) {
    // Payload processing
    var encoding = utils_1.utils.detectEncoding(request);
    request.payload = request.payload && request.payload.toString(encoding);
    request.rawPayload = request.payload;
    // Headers processing
    // Hapi lowercases the headers whereas AWS does not
    // so we recreate a custom headers object from the raw request
    var headersArray = request.raw.req.rawHeaders;
    // During tests, `server.inject` uses *shot*, a package
    // for performing injections that does not entirely mimick
    // Hapi's usual request object. rawHeaders are then missing
    // Hence the fallback for testing
    // Normal usage
    if (headersArray) {
        request.unprocessedHeaders = {};
        request.multiValueHeaders = {};
        for (var i = 0; i < headersArray.length; i += 2) {
            request.unprocessedHeaders[headersArray[i]] = headersArray[i + 1];
            request.multiValueHeaders[headersArray[i]] = (request.multiValueHeaders[headersArray[i]] || []).concat(headersArray[i + 1]);
        }
    }
    else {
        request.unprocessedHeaders = request.headers;
    }
};
var wrapHandler = function (descriptor, handler) {
    return function (request, h) {
        preProcessRequest(request);
        var event = createLambdaProxyContext_1.default(request, serverlessOptions, {});
        return new Promise(function (resolve) {
            var lambdaContext = createLambdaContext_1.createLambdaContext(descriptor, function (err, result) {
                var source = err ? err : result;
                var body = _.get(source, 'body');
                var response = h.response(body);
                response.header('Content-Type', 'application/json', { override: false, duplicate: false });
                var statusCode = _.get(source, 'statusCode');
                var headers = _.get(source, 'headers');
                if (!err && null != statusCode) {
                    response.code(statusCode);
                }
                _.keys(headers).forEach(function (key) { return response.header(key, headers[key]); });
                resolve(response);
            });
            handler(event, lambdaContext, lambdaContext.done);
        });
    };
};
var registerRoutes = function (service, server) {
    Object.keys(service.functions).forEach(function (functionName) {
        var descriptor = service.functions[functionName];
        descriptor.name = functionName;
        if (!descriptor.events) {
            return;
        }
        var handlerDescriptor = parseFunctionPath(descriptor.handler);
        var handlerFunctionName = handlerDescriptor.functionName;
        var handlerPath = handlerDescriptor.modulePath;
        var handlerModule = requireLambdaModule(handlerPath);
        var handler = handlerModule[handlerFunctionName];
        descriptor.events.forEach(function (event) {
            if (!event.http) {
                return;
            }
            var _a = event.http, _b = _a.method, method = _b === void 0 ? 'get' : _b, path = _a.path, authorizer = _a.authorizer;
            console.info("Registering route for lambda " + functionName + ": " + method + " " + path);
            var route = {
                config: {},
                handler: wrapHandler(descriptor, handler),
                method: method,
                path: "/" + path
            };
            if (method.toUpperCase() !== 'HEAD' && method.toUpperCase() !== 'GET') {
                route.config.payload = { parse: false };
            }
            if (authorizer) {
                route.config.auth = authorizer;
            }
            server.route(route);
        });
    });
};
var startServer = function (_a) {
    var service = _a.service, _b = _a.port, port = _b === void 0 ? 3000 : _b, _c = _a.host, host = _c === void 0 ? 'localhost' : _c;
    return __awaiter(_this, void 0, void 0, function () {
        var server, blippPlugin, goodPlugin;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    server = new Hapi.Server({
                        host: host,
                        port: port,
                        routes: {
                            cors: {
                                origin: ['*']
                            }
                        }
                    });
                    registerStreams(service);
                    stream.connect();
                    registerSNSEvents(service);
                    registerSQSEvents(service);
                    registerAuthSchemes(service, server);
                    blippPlugin = {
                        options: {
                            showAuth: true
                        },
                        plugin: blipp
                    };
                    goodPlugin = {
                        options: {
                            ops: {
                                interval: 1000
                            },
                            reporters: {
                                console: [
                                    {
                                        args: [
                                            {
                                                log: '*',
                                                request: '*',
                                                response: '*'
                                            }
                                        ],
                                        module: '@hapi/good-squeeze',
                                        name: 'Squeeze'
                                    },
                                    {
                                        module: '@hapi/good-console'
                                    },
                                    'stdout'
                                ]
                            }
                        },
                        plugin: good
                    };
                    return [4 /*yield*/, server.register([
                            blippPlugin,
                            goodPlugin
                        ])];
                case 1:
                    _d.sent();
                    registerRoutes(service, server);
                    return [4 /*yield*/, server.start()];
                case 2:
                    _d.sent();
                    console.info("Server running at: " + server.info.uri);
                    return [2 /*return*/, server];
            }
        });
    });
};
// noinspection JSUnusedGlobalSymbols
exports.start = function (host, port) { return __awaiter(_this, void 0, void 0, function () {
    var serverless_1, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                port = port || parseInt(process.env.PORT, 10) || undefined;
                host = host || process.env.HOST;
                console.info('Create Serverless');
                serverless_1 = new Serverless({});
                console.info('Init serverless');
                return [4 /*yield*/, serverless_1.init()];
            case 1:
                _a.sent();
                console.info('Populate service variables');
                return [4 /*yield*/, serverless_1.variables.populateService(serverless_1.pluginManager.cliOptions)];
            case 2:
                _a.sent();
                console.info('Override environment variables...');
                Object.keys(serverless_1.service.provider.environment || {}).forEach(function (key) {
                    process.env[key] = serverless_1.service.provider.environment[key];
                });
                return [4 /*yield*/, startServer({ service: serverless_1.service, port: port, host: host })];
            case 3:
                _a.sent();
                return [3 /*break*/, 5];
            case 4:
                e_1 = _a.sent();
                console.error(e_1);
                process.exit(1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); };
//# sourceMappingURL=index.js.map