"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Bluebird = require("bluebird");
var debug_1 = require("debug");
var http = require("http");
var log = debug_1.default('serverless-offline:snsEvents');
var SnsReader = /** @class */ (function () {
    function SnsReader(config) {
        this.options = {
            endpoint: process.env.AWS_SNS_ENDPOINT + '/messagesForTopic'
        };
        this.topics = {};
        this.interval = config.interval || 1000;
        this.isRunning = false;
        this.start = this.start.bind(this);
        this.callHandlersForTopics = this.callHandlersForTopics.bind(this);
        this.callHandlersForMessages = this.callHandlersForMessages.bind(this);
    }
    SnsReader.prototype.registerHandler = function (topic, handler, functionName) {
        this.topics[topic] = this.topics[topic] || [];
        this.topics[topic].push({ handler: handler, functionName: functionName });
    };
    SnsReader.prototype.connect = function () {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        log('- - - - S T A R T - - - -');
        this.intervalID = setInterval(this.start, this.interval);
    };
    SnsReader.prototype.getTopicsMessages = function () {
        var _this = this;
        var results = {};
        var _loop_1 = function (topic) {
            if (this_1.topics.hasOwnProperty(topic)) {
                results[topic] = new Promise(function (resolve) { return http.get(_this.options.endpoint + "/" + topic, function (res) {
                    res.setEncoding('utf8');
                    var body = '';
                    res.on('data', function (chunk) { return body += chunk; });
                    res.on('end', function () { return resolve(JSON.parse(body)); });
                }); });
            }
        };
        var this_1 = this;
        for (var topic in this.topics) {
            _loop_1(topic);
        }
        return Bluebird.props(results);
    };
    SnsReader.prototype.callHandlersForTopics = function (data) {
        var results = {};
        for (var topic in data) {
            if (data[topic] && data[topic].length) {
                results[topic] = this.callHandlersForMessages(data[topic], topic);
            }
        }
        return Bluebird.props(results);
    };
    SnsReader.prototype.callHandlersForMessages = function (messages, topic) {
        return Bluebird.map(this.topics[topic], function (_a) {
            var handler = _a.handler, functionName = _a.functionName;
            return Bluebird.map(messages, function (Message) { return new Promise(function (resolve) {
                var event = {
                    Records: [{
                            Sns: {
                                Message: Message
                            }
                        }]
                };
                handler(event, undefined, function (err, success) {
                    var status = err ? "error: " + err : "success: " + success;
                    resolve("HANDLER " + functionName + " for " + topic + " sns topic with message: " + Message + " END WORK with " + status);
                });
            }); });
        });
    };
    SnsReader.prototype.start = function () {
        var _this = this;
        this.getTopicsMessages()
            .then(this.callHandlersForTopics)
            .then(log)
            .catch(function (e) {
            log(e);
            log('RESTART');
            clearInterval(_this.intervalID);
            _this.intervalID = setInterval(_this.start, _this.interval);
        });
    };
    return SnsReader;
}());
exports.SnsReader = SnsReader;
//# sourceMappingURL=snsReader.js.map