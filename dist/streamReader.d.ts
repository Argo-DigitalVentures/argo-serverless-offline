interface IStreamReaderConfig {
    interval: number;
}
export declare class StreamReader {
    private dynamoStream;
    private events;
    private interval;
    constructor(config: IStreamReaderConfig);
    registerHandler(event: any, handler: () => void, functionName: string): void;
    private getTableName;
}
export {};
