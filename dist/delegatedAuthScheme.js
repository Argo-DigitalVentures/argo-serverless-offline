"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Boom = require("@hapi/boom");
var authCanExecuteResource_1 = require("./authCanExecuteResource");
var createLambdaContext_1 = require("./createLambdaContext");
var createAuthenticateFunction = function (authorizerOptions, options, authFun) {
    return function (request, h) {
        var authFunName = authorizerOptions.name;
        var identityHeader = 'authorization';
        // Get Authorization header
        var req = request.raw.req;
        // Get path params
        var pathParams = {};
        Object.keys(request.params).forEach(function (key) {
            // aws doesn't auto decode path params - hapi does
            pathParams[key] = encodeURIComponent(request.params[key]);
        });
        var event;
        // Create event Object for authFunction
        //   methodArn is the ARN of the function we are running we are authorizing access to (or not)
        //   Account ID and API ID are not simulated
        var authorization = req.headers[identityHeader];
        var matchedAuthorization = authorization && authorization.match(authorizerOptions.identityValidationExpression);
        var finalAuthorization = (matchedAuthorization && matchedAuthorization[1]) || '';
        event = {
            authorizationToken: finalAuthorization,
            type: 'TOKEN'
        };
        var httpMethod = request.method.toUpperCase();
        var apiId = 'random-api-id';
        var accountId = 'random-account-id';
        var resourcePath = request.path.replace(new RegExp("^/" + options.stage), '');
        event.methodArn = "arn:aws:execute-api:" + options.region + ":" + accountId + ":" + apiId + "/" + options.stage + "/" + httpMethod + resourcePath;
        event.requestContext = {
            accountId: accountId,
            apiId: apiId,
            httpMethod: httpMethod,
            requestId: 'random-request-id',
            resourceId: 'random-resource-id',
            resourcePath: resourcePath,
            stage: options.stage
        };
        var done = false;
        return new Promise(function (resolve, reject) {
            // Creat the Lambda Context for the Auth function
            var lambdaContext = createLambdaContext_1.createLambdaContext(authFun, function (err, result, fromPromise) {
                if (done) {
                    // tslint:disable max-line-length
                    var warning = fromPromise
                        ? "Warning: Auth function '" + authFunName + "' returned a promise and also uses a callback!\nThis is problematic and might cause issues in your lambda."
                        : "Warning: callback called twice within Auth function '" + authFunName + "'!";
                    console.warn(warning);
                    return;
                }
                done = true;
                // Return an unauthorized response
                var onError = function (error) {
                    console.error("Authorization function returned an error response: (\u03BB: " + authFunName + ")", error);
                    reject(Boom.unauthorized('Unauthorized'));
                };
                if (err) {
                    onError(err);
                    return;
                }
                var onSuccess = function (policy) {
                    // Validate that the policy document has the principalId set
                    if (null == policy) {
                        console.error("Authorization response was null or undefined: (\u03BB: " + authFunName + ")", err);
                        reject(Boom.badImplementation('Authorization response was null or undefined'));
                        return;
                    }
                    if (!policy.principalId) {
                        console.error("Authorization response did not include a principalId: (\u03BB: " + authFunName + ")", err);
                        reject(Boom.forbidden('No principalId set on the Response'));
                        return;
                    }
                    if (!authCanExecuteResource_1.default(policy.policyDocument, event.methodArn)) {
                        console.error("Authorization response didn't authorize user to access resource: (\u03BB: " + authFunName + ")", err);
                        reject(Boom.forbidden('User is not authorized to access this resource'));
                        return;
                    }
                    console.info("Authorization function returned a successful response: (\u03BB: " + authFunName + ")", JSON.stringify(policy));
                    // Set the credentials for the rest of the pipeline
                    resolve(h.authenticated({
                        credentials: {
                            context: policy.context,
                            usageIdentifierKey: policy.usageIdentifierKey,
                            user: policy.principalId
                        }
                    }));
                };
                if (result && typeof result.then === 'function') {
                    result.then(onSuccess, onError);
                }
                else if (result instanceof Error) {
                    onError(result);
                }
                else {
                    onSuccess(result);
                }
            });
            var x = authFun(event, lambdaContext, lambdaContext.done);
            if (x && typeof x.then === 'function') {
                return x.then(lambdaContext.succeed, lambdaContext.fail);
            }
            else if (x instanceof Error) {
                return lambdaContext.fail(x);
            }
        });
    };
};
// noinspection JSUnusedGlobalSymbols
exports.default = (function (authFun, authorizerOptions, options) { return ({
    authenticate: createAuthenticateFunction(authorizerOptions, options, authFun)
}); });
//# sourceMappingURL=delegatedAuthScheme.js.map