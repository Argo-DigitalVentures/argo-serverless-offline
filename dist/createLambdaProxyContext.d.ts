declare const _default: (request: any, options: any, stageVariables: any) => {
    body: any;
    headers: any;
    httpMethod: any;
    multiValueHeaders: any;
    multiValueQueryStringParameters: any;
    path: any;
    pathParameters: any;
    queryStringParameters: any;
    requestContext: {
        accountId: string;
        apiId: string;
        authorizer: any;
        httpMethod: any;
        identity: {
            accountId: string;
            apiKey: string;
            caller: string;
            cognitoAuthenticationProvider: any;
            cognitoAuthenticationType: string;
            cognitoIdentityId: any;
            cognitoIdentityPoolId: string;
            sourceIp: any;
            user: string;
            userAgent: any;
            userArn: string;
        };
        protocol: string;
        requestId: string;
        resourceId: string;
        resourcePath: any;
        stage: any;
    };
    resource: any;
    stageVariables: any;
};
export default _default;
