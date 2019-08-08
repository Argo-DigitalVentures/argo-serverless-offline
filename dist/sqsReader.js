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
Object.defineProperty(exports, "__esModule", { value: true });
var aws_sdk_1 = require("aws-sdk");
var SqsReader = /** @class */ (function () {
    function SqsReader(config) {
        this.interval = config.interval || 1000;
        this.sqsEndpoint = process.env.SQS_ENDPOINT || 'http://localhost:9324';
        this.registeredListeners = [];
        this.sqs = new aws_sdk_1.SQS({
            apiVersion: '2012-11-05',
            endpoint: this.sqsEndpoint,
            region: 'us-east-1'
        });
    }
    SqsReader.mapResponse = function (sqsOutput) {
        return { Records: sqsOutput.Messages.map(function (message) { return ({ body: message.Body }); }) };
    };
    SqsReader.handlerCallbackFactory = function (functionName) {
        return function (err, result) {
            if (err) {
                console.info(functionName + " error:\n" + err);
            }
            else {
                console.info(functionName + " returns:\n" + result);
            }
        };
    };
    SqsReader.prototype.sqsInterval = function (handler, queueUrl, functionName) {
        return __awaiter(this, void 0, void 0, function () {
            var sqsResult, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, this.sqs.receiveMessage({ QueueUrl: queueUrl }).promise()];
                    case 1:
                        sqsResult = _a.sent();
                        if (!sqsResult.Messages) {
                            return [2 /*return*/];
                        }
                        console.info("Run " + functionName + " lambda. Body:\n" + sqsResult.Messages[0].Body);
                        return [4 /*yield*/, handler(SqsReader.mapResponse(sqsResult), undefined, SqsReader.handlerCallbackFactory(functionName))];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.sqs.deleteMessage({
                                QueueUrl: queueUrl,
                                ReceiptHandle: sqsResult.Messages[0].ReceiptHandle
                            }).promise()];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        err_1 = _a.sent();
                        if (err_1 && 'AWS.SimpleQueueService.NonExistentQueue' === err_1.code) {
                            return [2 /*return*/];
                        }
                        console.error('Error during receiving message from SQS');
                        console.error(err_1 && err_1.stack || err_1);
                        process.exit(1);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    SqsReader.prototype.registerHandler = function (event, handler, functionName) {
        var _this = this;
        var queueName = event.sqs.arn['Fn::GetAtt'][0];
        if (-1 < this.registeredListeners.indexOf(queueName)) {
            throw new Error("Cannot register multiple listeners for the same queue: " + queueName);
        }
        console.info("Registering SQS listener for lambda " + functionName + " on queue " + queueName);
        this.registeredListeners.push(queueName);
        var queueUrl = this.sqsEndpoint + "/queue/" + queueName;
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, this.sqsInterval(handler, queueUrl, functionName)];
        }); }); }, this.interval);
    };
    return SqsReader;
}());
exports.SqsReader = SqsReader;
//# sourceMappingURL=sqsReader.js.map