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
Object.defineProperty(exports, "__esModule", { value: true });
var jwt = require("jsonwebtoken");
var utils_1 = require("./utils");
exports.default = (function (request, options, stageVariables) {
    var authPrincipalId = request.auth && request.auth.credentials && request.auth.credentials.user;
    var authContext = (request.auth && request.auth.credentials && request.auth.credentials.context) || {};
    var authAuthorizer;
    if (process.env.AUTHORIZER) {
        try {
            authAuthorizer = JSON.parse(process.env.AUTHORIZER);
        }
        catch (error) {
            console.error('Serverless-offline: Could not parse process.env.AUTHORIZER, make sure it is correct JSON.');
        }
    }
    var body = request.payload;
    var headers = request.unprocessedHeaders;
    if (body) {
        if (typeof body !== 'string') {
            // JSON.stringify(JSON.parse(request.payload)) is NOT the same as the rawPayload
            body = request.rawPayload;
        }
        // tslint:disable-next-line:max-line-length
        if (!headers['Content-Length'] && !headers['content-length'] && !headers['Content-length'] && (typeof body === 'string' || body instanceof Buffer || body instanceof ArrayBuffer)) {
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        // Set a default Content-Type if not provided.
        if (!headers['Content-Type'] && !headers['content-type'] && !headers['Content-type']) {
            headers['Content-Type'] = 'application/json';
        }
    }
    else if (typeof body === 'undefined' || body === '') {
        body = null;
    }
    var pathParams = {};
    Object.keys(request.params).forEach(function (key) {
        // aws doesn't auto decode path params - hapi does
        pathParams[key] = encodeURIComponent(request.params[key]);
    });
    var token = headers.Authorization || headers.authorization;
    if (token && token.split(' ')[0] === 'Bearer') {
        token = token.split(' ')[1];
    }
    var claims;
    if (token) {
        try {
            claims = jwt.decode(token) || undefined;
        }
        catch (err) {
            // Do nothing
        }
    }
    return {
        body: body,
        headers: headers,
        httpMethod: request.method.toUpperCase(),
        multiValueHeaders: request.multiValueHeaders,
        multiValueQueryStringParameters: utils_1.utils.nullIfEmpty(utils_1.utils.normalizeMultiValueQuery(request.query)),
        path: request.path,
        pathParameters: utils_1.utils.nullIfEmpty(pathParams),
        queryStringParameters: utils_1.utils.nullIfEmpty(utils_1.utils.normalizeQuery(request.query)),
        requestContext: {
            accountId: 'offlineContext_accountId',
            apiId: 'offlineContext_apiId',
            authorizer: authAuthorizer || __assign({}, authContext, { claims: claims, 
                // 'principalId' should have higher priority
                principalId: authPrincipalId || process.env.PRINCIPAL_ID || 'offlineContext_authorizer_principalId' // See #24
             }),
            httpMethod: request.method.toUpperCase(),
            identity: {
                accountId: process.env.SLS_ACCOUNT_ID || 'offlineContext_accountId',
                apiKey: process.env.SLS_API_KEY || 'offlineContext_apiKey',
                caller: process.env.SLS_CALLER || 'offlineContext_caller',
                // tslint:disable-next-line:max-line-length
                cognitoAuthenticationProvider: request.headers['cognito-authentication-provider'] || process.env.SLS_COGNITO_AUTHENTICATION_PROVIDER || 'offlineContext_cognitoAuthenticationProvider',
                cognitoAuthenticationType: process.env.SLS_COGNITO_AUTHENTICATION_TYPE || 'offlineContext_cognitoAuthenticationType',
                // tslint:disable-next-line:max-line-length
                cognitoIdentityId: request.headers['cognito-identity-id'] || process.env.SLS_COGNITO_IDENTITY_ID || 'offlineContext_cognitoIdentityId',
                cognitoIdentityPoolId: process.env.SLS_COGNITO_IDENTITY_POOL_ID || 'offlineContext_cognitoIdentityPoolId',
                sourceIp: request.info.remoteAddress,
                user: 'offlineContext_user',
                userAgent: request.headers['user-agent'] || '',
                userArn: 'offlineContext_userArn'
            },
            protocol: 'HTTP/1.1',
            requestId: "offlineContext_requestId_" + utils_1.utils.randomId(),
            resourceId: 'offlineContext_resourceId',
            resourcePath: request.route.path,
            stage: options.stage
        },
        resource: request.route.path,
        stageVariables: utils_1.utils.nullIfEmpty(stageVariables)
    };
});
//# sourceMappingURL=createLambdaProxyContext.js.map