"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var Bluebird = require("bluebird");
var debug_1 = require("debug");
var _ = require("lodash");
var log = debug_1.default('serverless-offline:streamReader');
var StreamKnowingStatusCodes = {
    Reader_EmptyStreams: 'Reader_EmptyStreams',
    Reader_EmptyActiveStream: 'Reader_EmptyActiveStream',
    Reader_NextShardIteratorNotExist: 'Reader_NextShardIteratorNotExist',
    TrimmedDataAccessException: 'TrimmedDataAccessException'
};
var ReadStream = /** @class */ (function () {
    function ReadStream(dynamoStream, interval, tableName) {
        var _this = this;
        this.addHandler = function (event) {
            _this.handlers.push(event);
        };
        this.getTableStreams = function (TableName) {
            var getStreams = function (options) { return __awaiter(_this, void 0, void 0, function () {
                var currentResult, _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0: return [4 /*yield*/, this.dynamoStream.listStreams(options).promise()];
                        case 1:
                            currentResult = _d.sent();
                            if (!currentResult.LastEvaluatedStreamArn) return [3 /*break*/, 3];
                            _b = (_a = _).merge;
                            _c = [currentResult.Streams];
                            return [4 /*yield*/, getStreams({ ExclusiveStartStreamArn: currentResult.LastEvaluatedStreamArn, TableName: TableName })];
                        case 2: return [2 /*return*/, _b.apply(_a, _c.concat([_d.sent()]))];
                        case 3: return [2 /*return*/, currentResult.Streams];
                    }
                });
            }); };
            return getStreams({ TableName: TableName });
        };
        this.getStreamsDescribes = function (streams) {
            if (!streams.length) {
                throw ({
                    message: "Expecting streams but dynamoDB returns empty streams table, could " + _this.tableName + " table has been created?",
                    code: StreamKnowingStatusCodes.Reader_EmptyStreams
                });
            }
            return Bluebird.map(streams, function (item) { return _this.getDescribes({ StreamArn: item.StreamArn }); });
        };
        this.getDescribes = function (params) {
            return _this.dynamoStream.describeStream(params).promise().then(function (res) { return res.StreamDescription; });
        };
        this.filterStream = function (streams) {
            return _.filter(streams, { StreamStatus: 'ENABLED' });
        };
        this.getShardIterator = function () {
            return _this.dynamoStream.getShardIterator({
                ShardId: _this.activeStream.Shards[0].ShardId,
                ShardIteratorType: 'TRIM_HORIZON',
                StreamArn: _this.activeStream.StreamArn
            }).promise();
        };
        this.getAllRecords = function (ShardIterator) {
            return _this.dynamoStream.getRecords({ ShardIterator: ShardIterator }).promise()
                .then(function (data) { return (__assign({}, data, { sourceARN: ShardIterator })); });
        };
        this.parseStreamData = function (StreamsData) {
            _this.nextShardIterator = StreamsData.NextShardIterator || 'NotExist';
            delete StreamsData.sourceARN;
            if (!StreamsData || 0 === (StreamsData.Records && StreamsData.Records.length)) {
                return "Stream for " + _this.tableName + " not have records";
            }
            log("Call " + (_this.handlers.length || 0) + " handlers for " + StreamsData.Records.length + " items in " + _this.tableName + " streams");
            StreamsData.Records = _.map(StreamsData.Records, function (record) { return (__assign({}, record, { TableName: _this.tableName, eventSourceARN: _this.activeStream.StreamArn })); });
            return Bluebird.map(_this.handlers, function (_a) {
                var handler = _a.handler, functionName = _a.functionName;
                return new Promise(function (resolve) {
                    return handler(StreamsData, undefined, function (err, success) {
                        var status = err ? "error: " + err : "success: " + success;
                        console.info("HANDLER " + functionName + " for " + _this.tableName + " END WORK with " + status);
                        resolve();
                    });
                });
            });
        };
        this.getAndParseStreamData = function () {
            if (_this.nextShardIterator === 'NotExist') {
                return Promise.reject({
                    message: 'nextShardIterator not exist',
                    code: StreamKnowingStatusCodes.Reader_NextShardIteratorNotExist
                });
            }
            return _this.getAllRecords(_this.nextShardIterator)
                .then(_this.parseStreamData);
        };
        this.start = function () {
            log("- - - - S T A R T (" + _this.tableName + ")- - - -");
            _this.getTableStreams(_this.tableName)
                .then(_this.getStreamsDescribes)
                .then(_this.filterStream)
                .then(function (streams) {
                if (streams.length) {
                    _this.activeStream = streams[0];
                }
                else {
                    throw ({
                        message: "Table " + _this.tableName + " can't have ACTIVE streams",
                        code: StreamKnowingStatusCodes.Reader_EmptyActiveStream
                    });
                }
            })
                .then(_this.getShardIterator)
                .then(function (shardIterator) {
                _this.nextShardIterator = shardIterator.ShardIterator;
                _this.intervalID = setInterval(function () { return _this.getAndParseStreamData().catch(_this.handleError); }, _this.interval);
            })
                .catch(_this.handleError);
        };
        this.handleError = function (e) {
            clearInterval(_this.intervalID);
            switch (e.code) {
                case StreamKnowingStatusCodes.TrimmedDataAccessException:
                case StreamKnowingStatusCodes.Reader_EmptyActiveStream:
                case StreamKnowingStatusCodes.Reader_EmptyStreams:
                case StreamKnowingStatusCodes.Reader_NextShardIteratorNotExist:
                    {
                        log("Restart Reader for table:" + _this.tableName);
                        setTimeout(function () { return _this.start(); }, 1000);
                    }
                    break;
                default: {
                    console.error("- - - - E R R O R  (" + _this.tableName + ")- - - -");
                    console.error("This is not knowing error, reader for " + _this.tableName + " will not restart");
                    console.error('Message', e.message);
                    console.trace(e);
                }
            }
        };
        this.activeStream = null;
        this.dynamoStream = dynamoStream;
        this.handlers = [];
        this.interval = interval;
        this.tableName = tableName;
        this.start();
    }
    return ReadStream;
}());
var StreamReader = /** @class */ (function () {
    function StreamReader(config) {
        this.getTableName = function (event) { return event.arn['Fn::GetAtt'][0]; };
        var options = {
            accessKeyId: process.env.AWS_DYNAMODB_ACCESS_KEY,
            apiVersion: '2012-08-10',
            endpoint: process.env.AWS_DYNAMODB_ENDPOINT || 'http://localhost:8000',
            region: process.env.AWS_REGION || 'ddblocal',
            secretAccessKey: process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY
        };
        this.dynamoStream = new aws_sdk_1.DynamoDBStreams(options);
        this.events = [];
        this.interval = config.interval || 1000;
    }
    StreamReader.prototype.registerHandler = function (event, handler, functionName) {
        if ('dynamodb' !== event.type) {
            return;
        }
        var tableName = this.getTableName(event);
        console.info("Register " + functionName + " lambda for " + tableName + " table streams");
        this.events[tableName] = this.events[tableName] || new ReadStream(this.dynamoStream, this.interval, tableName);
        this.events[tableName].addHandler({ handler: handler, functionName: functionName, arn: event.arn });
    };
    return StreamReader;
}());
exports.StreamReader = StreamReader;
//# sourceMappingURL=streamReader.js.map