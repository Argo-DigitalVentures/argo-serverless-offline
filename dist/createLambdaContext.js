"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
/*
  Mimics the lambda context object
  http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
*/
exports.createLambdaContext = function (fun, cb) {
    var functionName = fun.name;
    var done = typeof cb === 'function' ? cb : (function (x, y) { return x || y; }); // eslint-disable-line no-extra-parens
    return {
        awsRequestId: "offline_awsRequestId_" + utils_1.utils.randomId(),
        clientContext: {},
        done: done,
        fail: function (err) { return done(err, null, true); },
        functionName: functionName,
        functionVersion: "offline_functionVersion_for_" + functionName,
        identity: {},
        invokedFunctionArn: "offline_invokedFunctionArn_for_" + functionName,
        logGroupName: "offline_logGroupName_for_" + functionName,
        logStreamName: "offline_logStreamName_for_" + functionName,
        memoryLimitInMB: fun.memorySize,
        succeed: function (res) { return done(null, res, true); }
    };
};
//# sourceMappingURL=createLambdaContext.js.map