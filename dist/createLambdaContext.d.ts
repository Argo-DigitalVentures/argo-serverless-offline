export declare const createLambdaContext: (fun: any, cb: any) => {
    awsRequestId: string;
    clientContext: {};
    done: any;
    fail: (err: any) => any;
    functionName: any;
    functionVersion: string;
    identity: {};
    invokedFunctionArn: string;
    logGroupName: string;
    logStreamName: string;
    memoryLimitInMB: any;
    succeed: (res: any) => any;
};
