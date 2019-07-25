interface ISNSReaderConfig {
    interval: number;
}
export declare class SnsReader {
    isRunning: boolean;
    private topics;
    private interval;
    private intervalID;
    private options;
    constructor(config: ISNSReaderConfig);
    registerHandler(topic: any, handler: () => void, functionName: string): void;
    connect(): void;
    private getTopicsMessages;
    private callHandlersForTopics;
    private callHandlersForMessages;
    private start;
}
export {};
