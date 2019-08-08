interface ISQSReaderConfig {
    interval: number;
}
export declare class SqsReader {
    private readonly interval;
    private readonly sqsEndpoint;
    private registeredListeners;
    private sqs;
    constructor(config: ISQSReaderConfig);
    private static mapResponse;
    private static handlerCallbackFactory;
    private sqsInterval;
    registerHandler(event: any, handler: any, functionName: any): void;
}
export {};
