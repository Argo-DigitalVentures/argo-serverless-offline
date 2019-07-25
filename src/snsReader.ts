import * as Bluebird from 'bluebird';
import debug from 'debug';
import * as http from 'http';

interface ISNSReaderConfig {
  interval: number;
}

const log = debug('serverless-offline:snsEvents');

export class SnsReader {
  public isRunning: boolean;
  private topics: any;
  private interval;
  private intervalID;
  private options: any;

  constructor(config: ISNSReaderConfig) {
    this.options = {
      endpoint: process.env.AWS_SNS_ENDPOINT + '/messagesForTopic'
    };
    this.topics = {};
    this.interval = config.interval || 1000;
    this.isRunning = false;
    this.start = this.start.bind(this);
    this.callHandlersForTopics = this.callHandlersForTopics.bind(this);
    this.callHandlersForMessages = this.callHandlersForMessages.bind(this);
  }

  public registerHandler(topic: any, handler: () => void, functionName: string) {
    this.topics[topic] = this.topics[topic] || [];
    this.topics[topic].push({ handler, functionName });
  }

  public connect() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    log('- - - - S T A R T - - - -');
    this.intervalID = setInterval(this.start, this.interval);
  }

  private getTopicsMessages() {
    const results = {};
    for (const topic in this.topics) {
      if (this.topics.hasOwnProperty(topic)) {
        results[topic] = new Promise(resolve => http.get(`${this.options.endpoint}/${topic}`, res => {
          res.setEncoding('utf8');
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }));
      }
    }
    return Bluebird.props(results);
  }

  private callHandlersForTopics(data) {
    const results = {};
    for (const topic in data) {
      if (data[topic] && data[topic].length) {
        results[topic] = this.callHandlersForMessages(data[topic], topic);
      }
    }
    return Bluebird.props(results);
  }

  private callHandlersForMessages(messages, topic) {
    return Bluebird.map(this.topics[topic], ({ handler, functionName }) => {
      return Bluebird.map(messages, Message => new Promise(resolve => {
        const event = {
          Records: [{
            Sns: {
              Message
            }
          }]
        };
        handler(event, undefined, (err, success) => {
          const status = err ? `error: ${err}` : `success: ${success}`;
          resolve(`HANDLER ${functionName} for ${topic} sns topic with message: ${Message} END WORK with ${status}`);
        });
      }));
    });
  }

  private start() {
    this.getTopicsMessages()
      .then(this.callHandlersForTopics)
      .then(log)
      .catch(e => {
        log(e);
        log('RESTART');
        clearInterval(this.intervalID);
        this.intervalID = setInterval(this.start, this.interval);
      });
  }
}
