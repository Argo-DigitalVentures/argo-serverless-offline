import {SQS} from 'aws-sdk';

interface ISQSReaderConfig {
  interval: number;
}

export class SqsReader {
  private readonly interval: number;
  private readonly sqsEndpoint: string;
  private registeredListeners: string[];
  private sqs: SQS;

  constructor(config: ISQSReaderConfig) {
    this.interval = config.interval || 1000;
    this.sqsEndpoint = process.env.SQS_ENDPOINT || 'http://localhost:9324';
    this.registeredListeners = [];
    this.sqs = new SQS({
      apiVersion: '2012-11-05',
      endpoint: this.sqsEndpoint,
      region: 'us-east-1'
    });
  }

  private static mapResponse(sqsOutput) {
    return {Records: sqsOutput.Messages.map(message => ({body: message.Body}))};
  }

  private static handlerCallbackFactory(functionName) {
    return (err, result) => {
      if (err) {
        console.info(`${functionName} error:\n${err}`);
      } else {
        console.info(`${functionName} returns:\n${result}`);
      }
    };
  }

  private async sqsInterval(handler, queueUrl, functionName) {
    try {
      const sqsResult = await this.sqs.receiveMessage({QueueUrl: queueUrl}).promise();
      if (!sqsResult.Messages) {
        return;
      }
      console.info(`Run ${functionName} lambda. Body:\n${sqsResult.Messages[0].Body}`);
      await handler(SqsReader.mapResponse(sqsResult), undefined, SqsReader.handlerCallbackFactory(functionName));
      await this.sqs.deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: sqsResult.Messages[0].ReceiptHandle
      }).promise();
    } catch (err) {
      if (err && 'AWS.SimpleQueueService.NonExistentQueue' === err.code) {
        return;
      }
      console.error('Error during receiving message from SQS');
      console.error(err && err.stack || err);
      process.exit(1);
    }
  }

  public registerHandler(event, handler, functionName) {
    const queueName = event.sqs.arn['Fn::GetAtt'][0];
    if (-1 < this.registeredListeners.indexOf(queueName)) {
      throw new Error(`Cannot register multiple listeners for the same queue: ${queueName}`);
    }
    console.info(`Registering SQS listener for lambda ${functionName} on queue ${queueName}`);
    this.registeredListeners.push(queueName);
    const queueUrl = `${this.sqsEndpoint}/queue/${queueName}`;
    setInterval(async () => this.sqsInterval(handler, queueUrl, functionName), this.interval);
  }
}
