import { DynamoDBStreams } from 'aws-sdk';
import * as Bluebird from 'bluebird';
import * as _ from 'lodash';

interface IStreamReaderConfig {
  interval: number;
}

export class StreamReader {
  public isRunning: boolean;
  private events: any;
  private dynamoStream: DynamoDBStreams;
  private streams: DynamoDBStreams.Types.Stream[];
  private shards: DynamoDBStreams.Types.ShardIterator[];
  private interval;
  private intervalID;

  constructor(config: IStreamReaderConfig) {
    const options: DynamoDBStreams.Types.ClientConfiguration = {
      accessKeyId: process.env.AWS_DYNAMODB_ACCESS_KEY,
      apiVersion: '2012-08-10',
      endpoint: process.env.AWS_DYNAMODB_ENDPOINT,
      region: process.env.REGION || 'us-east-1',
      secretAccessKey: process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY
    };
    this.dynamoStream = new DynamoDBStreams(options);
    this.events = {};
    this.interval = config.interval || 1000;
    this.streams = [];
    this.isRunning = false;
  }

  static getARNFromShardIterator = (id: string) => id.substring(id.indexOf('|') + 1, id.lastIndexOf('|'));

  public registerHandler(event: any, handler: () => void, functionName: string) {
    if ('dynamodb' !== event.type) {
      return;
    }
    const tableName = this.getTableName(event);
    this.events[tableName] = this.events[tableName] || [];
    this.events[tableName].push({ handler, functionName });
  }

  public connect() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    console.info('- - - - - - - - - - START - - - - - - - - - -');
    this.getAllStreams()
      .then(this.getStreamsDescribes)
      .then(this.filterStream)
      .then(this.getShardIterators)
      .then(this.saveShards)
      .then(() => {
        this.intervalID = setInterval(() => this.getStreamData(), this.interval);
      })
      .catch(this.handleError);
  }

  private getTableName = event => event.arn['Fn::GetAtt'][0];

  private getAllStreams = async (options: DynamoDBStreams.Types.ListStreamsInput = {}) => {
    const currentResult = await this.dynamoStream.listStreams(options).promise();
    // Todo: dynamoStream.listStreams returns 100 elements, for more use options;
    // https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_streams_ListStreams.html
    this.streams = [...this.streams, ...currentResult.Streams];
  }

  private getDescribes = (params: DynamoDBStreams.Types.DescribeStreamInput): Promise<DynamoDBStreams.Types.StreamDescription> =>
    this.dynamoStream.describeStream(params).promise().then(res => res.StreamDescription)

  private getStreamsDescribes = (): DynamoDBStreams.Types.StreamDescription[] => {
    if (!this.streams.length) {
      console.info('Expect streams but dynamoDB returns empty streams table');
      return [];
    }
    return Bluebird.map(this.streams, item => this.getDescribes({ StreamArn: item.StreamArn }));
  }

  private filterStream = (streams: DynamoDBStreams.Types.StreamDescription[]) => {
    const tables = _.keys(this.events);
    return _.filter(streams, item => 'ENABLED' === item.StreamStatus && tables.includes(item.TableName));
  }

  private getShardIterators = (data): Promise<DynamoDBStreams.Types.ShardIterator[]> => {
    return Bluebird.map(data, (StreamDescription: DynamoDBStreams.Types.StreamDescription) => this.dynamoStream.getShardIterator({
      ShardId: StreamDescription.Shards[0].ShardId,
      ShardIteratorType: 'TRIM_HORIZON',
      StreamArn: StreamDescription.StreamArn
    }).promise());
  }

  private saveShards = (shards: DynamoDBStreams.Types.ShardIterator[]): void => {
    this.shards = _.map(shards, shard => shard.ShardIterator);
  }

  private getAllRecords = (): Promise<DynamoDBStreams.Types.GetRecordsOutput[]> => {
    const handleGetAllRecordsError = async (e: Error, ShardIterator: string) => {
      console.warn('getAllRecords error:', e);
      console.info('INVALID SHARD!', ShardIterator);
      return null;
    };
    return Bluebird.map(this.shards, (ShardIterator: DynamoDBStreams.Types.ShardIterator) =>
      this.dynamoStream.getRecords({ ShardIterator })
        .promise()
        .catch((e: Error) => handleGetAllRecordsError(e, ShardIterator))
    );
  }

  private parseStreamData = (StreamsData: DynamoDBStreams.Types.GetRecordsOutput[]) => {
    this.shards = _.map(StreamsData, (item: DynamoDBStreams.Types.GetRecordsOutput) => item && item.NextShardIterator || null);
    return Bluebird.map(StreamsData, (stream: DynamoDBStreams.Types.GetRecordsOutput) => {
      const arn = StreamReader.getARNFromShardIterator(stream.NextShardIterator);
      const streamDefinition = _.find(this.streams, { StreamArn: arn });

      if (!stream || 0 === (stream.Records && stream.Records.length)) {
        return `Stream for ${streamDefinition.TableName} not have records`;
      }

      console.info(`Call ${this.events[streamDefinition.TableName].length || 0} handlers for ${stream.Records.length} ` +
        `items in ${streamDefinition.TableName} streams`);

      stream.Records = _.map(stream.Records, (record: DynamoDBStreams.Types.Record) => ({
        ...record,
        TableName: streamDefinition.TableName,
        eventSourceARN: streamDefinition.StreamArn
      }));

      return Bluebird.map(this.events[streamDefinition.TableName], ({ handler, functionName }) => new Promise(resolve =>
        handler(stream, undefined, (err, success) =>
          resolve(`HANDLER ${functionName} for ${streamDefinition.TableName} END WORK with err: ${err}, success: ${success}`))
      ));
    });
  }

  private checkShards = async () => {
    if (-1 !== _.findIndex(this.shards, i => null === i)) {
      throw new Error('Some Shards are invalid');
    }
    return;
  }

  private handleError = (e: Error) => {
    console.info('- - - - - - - - - - E R R O R - - - - - - - - - -');
    console.warn(e);
    clearInterval(this.intervalID);
    setTimeout(() => {
      console.info('RESTART');
      this.connect();
    }, 1000);
    this.isRunning = false;
    this.streams = [];
    this.shards = [];
  }

  private getStreamData = () => {
    this.checkShards()
      .then(this.getAllRecords)
      .then(this.parseStreamData)
      .then(logs => {
        console.info('- - - - - - - - - - STREAM LOGS - - - - - - - - - -');
        console.info(logs);
        console.info('- - - - - - - - - - END LOGS - - - - - - - - - -');
      })
      .catch(this.handleError);
  }
}
