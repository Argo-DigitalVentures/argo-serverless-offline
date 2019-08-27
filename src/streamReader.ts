import { DynamoDBStreams } from 'aws-sdk';
import * as Bluebird from 'bluebird';
import debug from 'debug';
import * as _ from 'lodash';

interface IStreamReaderConfig {
  interval: number;
}

interface IStreamRecord extends DynamoDBStreams.Types.GetRecordsOutput {
  e?: any;
  sourceARN?: string;
}

const log = debug('serverless-offline:streamReader');

export class StreamReader {
  private events: any;
  private eventsRegistered: boolean;
  private dynamoStream: DynamoDBStreams;
  private streams: DynamoDBStreams.Types.Stream[];
  private shards: DynamoDBStreams.Types.ShardIterator[];
  private interval;
  private intervalID;

  constructor(config: IStreamReaderConfig) {
    const options: DynamoDBStreams.Types.ClientConfiguration = {
      accessKeyId: process.env.AWS_DYNAMODB_ACCESS_KEY,
      apiVersion: '2012-08-10',
      endpoint: process.env.AWS_DYNAMODB_ENDPOINT || 'http://localhost:8000',
      region: process.env.REGION || 'us-east-1',
      secretAccessKey: process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY
    };
    this.dynamoStream = new DynamoDBStreams(options);
    this.events = {};
    this.eventsRegistered = false;
    this.interval = config.interval || 1000;
    this.streams = [];
  }

  static getARNFromShardIterator = (id: string) => id.substring(id.indexOf('|') + 1, id.lastIndexOf('|'));

  public registerHandler(event: any, handler: () => void, functionName: string) {
    if ('dynamodb' !== event.type) {
      return;
    }
    const tableName = this.getTableName(event);
    this.events[tableName] = this.events[tableName] || [];
    this.events[tableName].push({ handler, functionName, arn: event.arn });
    this.eventsRegistered = true;
  }

  public connect() {
    if (!this.eventsRegistered) {
      return;
    }
    log('- - - - S T A R T - - - -');
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

  private getAllStreams = async () => {
    this.streams = _.flatten(await Bluebird.map(_.keys(this.events), this.getTableStreams));
    return Promise.resolve();
  }

  private getDescribes = (params: DynamoDBStreams.Types.DescribeStreamInput): Promise<DynamoDBStreams.Types.StreamDescription> =>
    this.dynamoStream.describeStream(params).promise().then(res => res.StreamDescription)

  private getStreamsDescribes = (): DynamoDBStreams.Types.StreamDescription[] => {
    if (!this.streams.length) {
      log('Expect streams but dynamoDB returns empty streams table');
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
      log(`getAllRecords error: ${e}`);
      log(`INVALID SHARD!', ${ShardIterator}`);
      return { e, ShardIterator };
    };
    return Bluebird.map(this.shards, (ShardIterator: DynamoDBStreams.Types.ShardIterator) =>
      this.dynamoStream.getRecords({ ShardIterator })
        .promise().then(data => ({ ...data, sourceARN: ShardIterator }))
        .catch((e: Error) => handleGetAllRecordsError(e, ShardIterator))
    );
  }

  private parseStreamData = (StreamsData: IStreamRecord[]) => {
    this.shards = _.map(StreamsData, (item: IStreamRecord) => item && item.NextShardIterator || null);
    return Bluebird.map(StreamsData, (stream: IStreamRecord) => {
      if (stream.e) {
        return;
      }

      const StreamArn = StreamReader.getARNFromShardIterator(stream.sourceARN);
      delete stream.sourceARN;
      const streamDefinition = _.find(this.streams, { StreamArn });

      if (!stream || 0 === (stream.Records && stream.Records.length)) {
        return `Stream for ${streamDefinition.TableName} not have records`;
      }

      log(`Call ${this.events[streamDefinition.TableName].length || 0} handlers for ${stream.Records.length} ` +
        `items in ${streamDefinition.TableName} streams`);

      stream.Records = _.map(stream.Records, (record: DynamoDBStreams.Types.Record) => ({
        ...record,
        TableName: streamDefinition.TableName,
        eventSourceARN: streamDefinition.StreamArn
      }));

      return Bluebird.map(this.events[streamDefinition.TableName], ({ handler, functionName }) => new Promise(resolve =>
        handler(stream, undefined, (err, success) => {
            const status = err ? `error: ${err}` : `success: ${success}`;
            resolve(`HANDLER ${functionName} for ${streamDefinition.TableName} END WORK with ${status}`);
          }
        )));
    });
  }

  private checkShards = async () => {
    if (-1 !== _.findIndex(this.shards, i => null === i)) {
      throw new Error('Some Shards are invalid');
    }
    return;
  }

  private handleError = (e: Error) => {
    console.error('- - - - E R R O R - - - -');
    console.error(e);
    clearInterval(this.intervalID);
    setTimeout(() => {
      log('RESTART');
      this.connect();
    }, 1000);
    this.streams = [];
    this.shards = [];
  }

  private getStreamData = () => {
    this.checkShards()
      .then(this.getAllRecords)
      .then(this.parseStreamData)
      .then(logs => {
        log('- - - - L O G S - - - -');
        log('\n', logs);
        log('- - - - E  N  D - - - -');
      })
      .catch(this.handleError);
  }
}
