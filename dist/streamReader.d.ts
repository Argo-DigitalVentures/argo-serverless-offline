interface IStreamReaderConfig {
    interval: number;
}
export declare class StreamReader {
    isRunning: boolean;
    private events;
    private dynamoStream;
    private streams;
    private shards;
    private interval;
    private intervalID;
    constructor(config: IStreamReaderConfig);
    static getARNFromShardIterator: (id: string) => string;
    registerHandler(event: any, handler: () => void, functionName: string): void;
    connect(): void;
    private getTableName;
    private getAllStreams;
    private getDescribes;
    private getStreamsDescribes;
    private filterStream;
    private getShardIterators;
    private saveShards;
    private getAllRecords;
    private parseStreamData;
    private checkShards;
    private handleError;
    private getStreamData;
}
export {};
