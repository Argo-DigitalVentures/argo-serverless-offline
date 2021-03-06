import * as good from '@hapi/good';
import * as Hapi from '@hapi/hapi';
import * as blipp from 'blipp';
import * as _ from 'lodash';
import * as Serverless from 'serverless';
import { createLambdaContext } from './createLambdaContext';
import createLambdaProxyContext from './createLambdaProxyContext';
import delegatedAuthScheme from './delegatedAuthScheme';
import { SnsReader } from './snsReader';
import { SqsReader } from './sqsReader';
import { StreamReader } from './streamReader';
import { utils } from './utils';

const stream = new StreamReader({ interval: Number(process.env.STREAM_READER_INTERVAL) });
const sns = new SnsReader({ interval: Number(process.env.SNS_READER_INTERVAL) });
const sqs = new SqsReader({ interval: Number(process.env.SQS_READER_INTERVAL) });

const serverlessOptions = { stage: process.env.STAGE || 'ci' };

const requireLambdaModule = modulePath => require(`${process.cwd()}/${modulePath}`);

const reduceFunctionArray = (serviceFunctions) => {
  if (Array.isArray(serviceFunctions)) {
    return serviceFunctions.reduce((functionsObject, functionItem) => {
      Object.keys(functionItem).forEach(key => {
        functionsObject[key] = functionItem[key];
      });
      return functionsObject;
    }, {});
  }
  return serviceFunctions;
}

const parseFunctionPath = path => {
  const handlerPathSegments = path.split('.');
  const functionName = handlerPathSegments[handlerPathSegments.length - 1];
  handlerPathSegments.pop();
  const modulePath = handlerPathSegments.join('.');
  return {
    functionName,
    modulePath
  };
};

const getHandler = descriptor => {
  const handlerDescriptor = parseFunctionPath(descriptor.handler);
  const handlerModule = requireLambdaModule(handlerDescriptor.modulePath);
  return handlerModule[handlerDescriptor.functionName];
};

const registerAuthSchemes = (service: any, server: Hapi.Server) => {
  const authorizersMap = {};
  const serviceFunctions = reduceFunctionArray(service.functions);
  Object.keys(serviceFunctions).forEach(functionName => {
    const descriptor = serviceFunctions[functionName];
    if (!descriptor.events) {
      return;
    }
    descriptor.events.forEach(event => {
      if (event.http && event.http.authorizer) {
        authorizersMap[event.http.authorizer] = true;
      }
    });
  });
  Object.keys(authorizersMap).forEach(functionName => {
    const handler = getHandler(serviceFunctions[functionName]);
    const scheme = () => {
      const authorizerOptions = {
        identitySource: 'method.request.header.Authorization',
        identityValidationExpression: '(.*)',
        name: functionName,
        resultTtlInSeconds: '300'
      };
      return delegatedAuthScheme(handler, authorizerOptions, serverlessOptions);
    };

    server.auth.scheme(functionName, scheme);
    server.auth.strategy(functionName, functionName);
  });
};

const registerStreams = (service: any) => {
  const serviceFunctions = reduceFunctionArray(service.functions);
  Object.keys(serviceFunctions).forEach(functionName => {
    const descriptor = serviceFunctions[functionName];
    if (!descriptor.events) {
      return;
    }
    descriptor.events.forEach(event => {
      if (event.stream) {
        stream.registerHandler(event.stream, getHandler(descriptor), functionName);
        return;
      }
    });
  });
};

const registerSNSEvents = (service: any) => {
  const serviceFunctions = reduceFunctionArray(service.functions);
  Object.keys(serviceFunctions).forEach(functionName => {
    const descriptor = serviceFunctions[functionName];
    if (!descriptor.events) {
      return;
    }
    descriptor.events.forEach(event => {
      if (event.sns) {
        sns.registerHandler(event.sns, getHandler(descriptor), functionName);
        sns.connect();
        return;
      }
    });
  });
};

const registerSQSEvents = service => {
  const serviceFunctions = reduceFunctionArray(service.functions);
  Object.keys(serviceFunctions).forEach(functionName => {
    const descriptor = serviceFunctions[functionName];
    if (descriptor.events && descriptor.events.length) {
      descriptor.events.forEach(event => event.sqs && sqs.registerHandler(event, getHandler(descriptor), functionName));
    }
  });
};

const preProcessRequest = request => {
  // Payload processing
  const encoding = utils.detectEncoding(request);

  request.payload = request.payload && request.payload.toString(encoding);
  request.rawPayload = request.payload;

  // Headers processing
  // Hapi lowercases the headers whereas AWS does not
  // so we recreate a custom headers object from the raw request
  const headersArray = request.raw.req.rawHeaders;

  // During tests, `server.inject` uses *shot*, a package
  // for performing injections that does not entirely mimick
  // Hapi's usual request object. rawHeaders are then missing
  // Hence the fallback for testing

  // Normal usage
  if (headersArray) {
    request.unprocessedHeaders = {};
    request.multiValueHeaders = {};

    for (let i = 0; i < headersArray.length; i += 2) {
      request.unprocessedHeaders[headersArray[i]] = headersArray[i + 1];
      request.multiValueHeaders[headersArray[i]] = (request.multiValueHeaders[headersArray[i]] || []).concat(headersArray[i + 1]);
    }
  } else {
    request.unprocessedHeaders = request.headers;
  }
};

const wrapHandler = (descriptor, handler) => {
  return (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
    preProcessRequest(request);
    const event = createLambdaProxyContext(request, serverlessOptions, {});
    return new Promise(resolve => {
      const lambdaContext = createLambdaContext(descriptor, (err, result) => {
        const source = err ? err : result;
        const body = _.get(source, 'body');
        const response = h.response(body);
        response.header('Content-Type', 'application/json', { override: false, duplicate: false });
        const statusCode = _.get(source, 'statusCode');
        const headers = _.get(source, 'headers');
        if (!err && null != statusCode) {
          response.code(statusCode);
        }
        _.keys(headers).forEach(key => response.header(key, headers[key]));
        resolve(response);
      });
      handler(event, lambdaContext, lambdaContext.done);
    });
  };
};

const registerRoutes = (service: any, server: Hapi.Server) => {
  const serviceFunctions = reduceFunctionArray(service.functions);
  Object.keys(serviceFunctions).forEach(functionName => {
    const descriptor = serviceFunctions[functionName];
    descriptor.name = functionName;
    if (!descriptor.events) {
      return;
    }
    const handlerDescriptor = parseFunctionPath(descriptor.handler);
    const handlerFunctionName = handlerDescriptor.functionName;
    const handlerPath = handlerDescriptor.modulePath;
    const handlerModule = requireLambdaModule(handlerPath);
    const handler = handlerModule[handlerFunctionName];
    descriptor.events.forEach(event => {
      if (!event.http) {
        return;
      }
      const { method = 'get', path, authorizer } = event.http;
      console.info(`Registering route for lambda ${functionName}: ${method} ${path}`);
      const route: Hapi.ServerRoute = {
        config: {},
        handler: wrapHandler(descriptor, handler),
        method,
        path: `/${path}`
      };
      if (method.toUpperCase() !== 'HEAD' && method.toUpperCase() !== 'GET') {
        route.config.payload = { parse: false };
      }
      if (authorizer) {
        route.config.auth = authorizer;
      }
      server.route(route);
    });
  });
};

const startServer = async ({ service, port = 3000, host = 'localhost' }) => {
  const server = new Hapi.Server({
    host,
    port,
    routes: {
      cors: {
        origin: ['*']
      }
    }
  });
  registerStreams(service);
  registerSNSEvents(service);
  registerSQSEvents(service);
  registerAuthSchemes(service, server);

  const blippPlugin = {
    options: {
      showAuth: true
    },
    plugin: blipp
  };
  const goodPlugin = {
    options: {
      ops: {
        interval: 1000
      },
      reporters: {
        console: [
          {
            args: [
              {
                log: '*',
                request: '*',
                response: '*'
              }
            ],
            module: '@hapi/good-squeeze',
            name: 'Squeeze'
          },
          {
            module: '@hapi/good-console'
          },
          'stdout'
        ]
      }
    },
    plugin: good
  };
  await server.register([
    blippPlugin,
    goodPlugin
  ]);

  registerRoutes(service, server);

  await server.start();
  console.info(`Server running at: ${server.info.uri}`);
  return server;
};

// noinspection JSUnusedGlobalSymbols
export const start = async (host?: string, port?: number) => {
  try {
    port = port || parseInt(process.env.PORT, 10) || undefined;
    host = host || process.env.HOST;
    console.info('Create Serverless');
    const serverless = new Serverless({});
    console.info('Init serverless');
    await serverless.init();
    console.info('Populate service variables');
    await serverless.variables.populateService(serverless.pluginManager.cliOptions);
    console.info('Override environment variables...');
    Object.keys(serverless.service.provider.environment || {}).forEach(key => {
      process.env[key] = serverless.service.provider.environment[key];
    });
    await startServer({ service: serverless.service, port, host });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
