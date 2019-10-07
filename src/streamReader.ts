import { DynamoDBStreams } from 'aws-sdk';
import * as Bluebird from 'bluebird';
import debug from 'debug';
import * as _ from 'lodash';

interface IStreamReaderConfig {
  interval: number;
}

const log = debug('serverless-offline:streamReader');

const StreamKnowingStatusCodes = {
  Reader_EmptyStreams: 'Reader_EmptyStreams',
  Reader_EmptyActiveStream: 'Reader_EmptyActiveStream',
  Reader_NextShardIteratorNotExist: 'Reader_NextShardIteratorNotExist',
  TrimmedDataAccessException: 'TrimmedDataAccessException'
};

class ReadStream {
  private activeStream: DynamoDBStreams.Types.StreamDescription;
  private dynamoStream: DynamoDBStreams;
  private readonly handlers;
  private nextShardIterator: DynamoDBStreams.Types.ShardIterator;
  private readonly interval;
  private intervalID;
  private readonly tableName: string;

  constructor(dynamoStream: DynamoDBStreams, interval: number, tableName: string) {
    this.activeStream = null;
    this.dynamoStream = dynamoStream;
    this.handlers = [];
    this.interval = interval;
    this.tableName = tableName;
    this.start();
  }

  public addHandler = (event) => {
    this.handlers.push(event);
  }

  private getTableStreams = TableName => {
    const getStreams = async (options: DynamoDBStreams.Types.ListStreamsInput) => {
      const currentResult = await this.dynamoStream.listStreams(options).promise();
      if (currentResult.LastEvaluatedStreamArn) {
        return _.merge(currentResult.Streams,
          await getStreams({ ExclusiveStartStreamArn: currentResult.LastEvaluatedStreamArn, TableName }));
      }
      return currentResult.Streams;
    };
    return getStreams({ TableName });
  }

  private getStreamsDescribes = (streams: DynamoDBStreams.Types.Stream[]): DynamoDBStreams.Types.StreamDescription[] => {
    if (!streams.length) {
      throw ({
        message: `Expecting streams but dynamoDB returns empty streams table, could ${this.tableName} table has been created?`,
        code: StreamKnowingStatusCodes.Reader_EmptyStreams
      });
    }
    return Bluebird.map(streams, item => this.getDescribes({ StreamArn: item.StreamArn }));
  }

  private getDescribes = (params: DynamoDBStreams.Types.DescribeStreamInput): Promise<DynamoDBStreams.Types.StreamDescription> =>
    this.dynamoStream.describeStream(params).promise().then(res => res.StreamDescription)

  private filterStream = (streams: DynamoDBStreams.Types.StreamDescription[]) =>
    _.filter(streams, { StreamStatus: 'ENABLED' })

  private getShardIterator = (): Promise<any> =>
    this.dynamoStream.getShardIterator({
      ShardId: this.activeStream.Shards[0].ShardId,
      ShardIteratorType: 'TRIM_HORIZON',
      StreamArn: this.activeStream.StreamArn
    }).promise()

  private getAllRecords = (ShardIterator: DynamoDBStreams.Types.ShardIterator): Promise<DynamoDBStreams.Types.GetRecordsOutput> =>
    this.dynamoStream.getRecords({ ShardIterator }).promise()
      .then(data => ({ ...data, sourceARN: ShardIterator }))

  private parseStreamData = (StreamsData) => {
    this.nextShardIterator = StreamsData.NextShardIterator || 'NotExist';

    delete StreamsData.sourceARN;

    if (!StreamsData || 0 === (StreamsData.Records && StreamsData.Records.length)) {
      return `Stream for ${this.tableName} not have records`;
    }

    log(`Call ${this.handlers.length || 0} handlers for ${StreamsData.Records.length} items in ${this.tableName} streams`);

    StreamsData.Records = _.map(StreamsData.Records, (record: DynamoDBStreams.Types.Record) => ({
      ...record,
      TableName: this.tableName,
      eventSourceARN: this.activeStream.StreamArn
    }));

    return Bluebird.map(this.handlers, ({ handler, functionName }) => new Promise(resolve =>
      handler(StreamsData, undefined, (err, success) => {
          const status = err ? `error: ${err}` : `success: ${success}`;
          console.info(`HANDLER ${functionName} for ${this.tableName} END WORK with ${status}`);
          resolve();
        }
      )));

  }

  private getAndParseStreamData = (): Promise<any> => {
    if (this.nextShardIterator === 'NotExist') {
      return Promise.reject({
        message: 'nextShardIterator not exist',
        code: StreamKnowingStatusCodes.Reader_NextShardIteratorNotExist
      });
    }
    return this.getAllRecords(this.nextShardIterator)
      .then(this.parseStreamData)
  }

  private start = () => {
    log(`- - - - S T A R T (${this.tableName})- - - -`);
    this.getTableStreams(this.tableName)
      .then(this.getStreamsDescribes)
      .then(this.filterStream)
      .then(streams => {
        if (streams.length) {
          this.activeStream = streams[0];
        } else {
          throw ({
            message: `Table ${this.tableName} can't have ACTIVE streams`,
            code: StreamKnowingStatusCodes.Reader_EmptyActiveStream
          });
        }
      })
      .then(this.getShardIterator)
      .then((shardIterator) => {
        this.nextShardIterator = shardIterator.ShardIterator;
        this.intervalID = setInterval(() => this.getAndParseStreamData().catch(this.handleError), this.interval);
      })
      .catch(this.handleError);
  }

  private handleError = (e) => {
    clearInterval(this.intervalID);

    switch(e.code){
      case StreamKnowingStatusCodes.TrimmedDataAccessException:
      case StreamKnowingStatusCodes.Reader_EmptyActiveStream:
      case StreamKnowingStatusCodes.Reader_EmptyStreams:
      case StreamKnowingStatusCodes.Reader_NextShardIteratorNotExist: {
        log(`Restart Reader for table:${this.tableName}`);
        setTimeout(() => this.start(), 1000);
      }
      break;
      default: {
        console.error(`- - - - E R R O R  (${this.tableName})- - - -`);
        console.error(`This is not knowing error, reader for ${this.tableName} will not restart`);
        console.error('Message', e.message);
        console.trace(e);
      }
    }
  }
}

export class StreamReader {
  private dynamoStream: DynamoDBStreams;
  private events: any;
  private interval;

  constructor(config: IStreamReaderConfig) {
    const options: DynamoDBStreams.Types.ClientConfiguration = {
      accessKeyId: process.env.AWS_DYNAMODB_ACCESS_KEY,
      apiVersion: '2012-08-10',
      endpoint: process.env.AWS_DYNAMODB_ENDPOINT || 'http://localhost:8000',
      region: process.env.AWS_REGION || 'ddblocal',
      secretAccessKey: process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY
    };
    this.dynamoStream = new DynamoDBStreams(options);
    this.events = [];
    this.interval = config.interval || 1000;
  }

  public registerHandler(event: any, handler: () => void, functionName: string) {
    if ('dynamodb' !== event.type) {
      return;
    }
    const tableName = this.getTableName(event);
    console.info(`Register ${functionName} lambda for ${tableName} table streams`);
    this.events[tableName] = this.events[tableName] || new ReadStream(this.dynamoStream, this.interval, tableName);
    this.events[tableName].addHandler({ handler, functionName, arn: event.arn });
  }

  private getTableName = event => event.arn['Fn::GetAtt'][0]
}
