import { utils } from './utils';

/*
  Mimics the lambda context object
  http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
*/
export const createLambdaContext = (fun, cb) => {

  const functionName = fun.name;
  const done = typeof cb === 'function' ? cb : ((x, y) => x || y); // eslint-disable-line no-extra-parens

  return {
    awsRequestId: `offline_awsRequestId_${utils.randomId()}`,
    clientContext: {},
    done,
    fail: err => done(err, null, true),
    functionName,
    functionVersion: `offline_functionVersion_for_${functionName}`,
    identity: {},
    invokedFunctionArn: `offline_invokedFunctionArn_for_${functionName}`,
    logGroupName: `offline_logGroupName_for_${functionName}`,
    logStreamName: `offline_logStreamName_for_${functionName}`,
    memoryLimitInMB: fun.memorySize,
    succeed: res => done(null, res, true)
  };
};
