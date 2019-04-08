import * as Boom from 'boom';
import authCanExecuteResource from './authCanExecuteResource';
import { createLambdaContext } from './createLambdaContext';

const createAuthenticateFunction = (authorizerOptions, options, authFun) => {
  return (request, h) => {
    const authFunName = authorizerOptions.name;

    const identityHeader = 'authorization';

    // Get Authorization header
    const req = request.raw.req;

    // Get path params
    const pathParams = {};
    Object.keys(request.params).forEach(key => {
      // aws doesn't auto decode path params - hapi does
      pathParams[key] = encodeURIComponent(request.params[key]);
    });

    let event;

    // Create event Object for authFunction
    //   methodArn is the ARN of the function we are running we are authorizing access to (or not)
    //   Account ID and API ID are not simulated

    const authorization = req.headers[identityHeader];

    const matchedAuthorization = authorization && authorization.match(authorizerOptions.identityValidationExpression);
    const finalAuthorization = (matchedAuthorization && matchedAuthorization[1]) || '';
    event = {
      authorizationToken: finalAuthorization,
      type: 'TOKEN'
    };

    const httpMethod = request.method.toUpperCase();
    const apiId = 'random-api-id';
    const accountId = 'random-account-id';
    const resourcePath = request.path.replace(new RegExp(`^/${options.stage}`), '');

    event.methodArn = `arn:aws:execute-api:${options.region}:${accountId}:${apiId}/${options.stage}/${httpMethod}${resourcePath}`;

    event.requestContext = {
      accountId,
      apiId,
      httpMethod,
      requestId: 'random-request-id',
      resourceId: 'random-resource-id',
      resourcePath,
      stage: options.stage
    };

    let done = false;

    return new Promise((resolve, reject) => {
      // Creat the Lambda Context for the Auth function
      const lambdaContext = createLambdaContext(authFun, (err, result, fromPromise) => {
        if (done) {
          // tslint:disable max-line-length
          const warning = fromPromise
            ? `Warning: Auth function '${authFunName}' returned a promise and also uses a callback!\nThis is problematic and might cause issues in your lambda.`
            : `Warning: callback called twice within Auth function '${authFunName}'!`;
          console.warn(warning);
          return;
        }

        done = true;

        // Return an unauthorized response
        const onError = error => {
          console.error(`Authorization function returned an error response: (λ: ${authFunName})`, error);
          reject(Boom.unauthorized('Unauthorized'));
        };

        if (err) {
          onError(err);
          return;
        }

        const onSuccess = policy => {
          // Validate that the policy document has the principalId set
          if (null == policy) {
            console.error(`Authorization response was null or undefined: (λ: ${authFunName})`, err);
            reject(Boom.badImplementation('Authorization response was null or undefined'));
            return;
          }
          if (!policy.principalId) {
            console.error(`Authorization response did not include a principalId: (λ: ${authFunName})`, err);
            reject(Boom.forbidden('No principalId set on the Response'));
            return;
          }

          if (!authCanExecuteResource(policy.policyDocument, event.methodArn)) {
            console.error(`Authorization response didn't authorize user to access resource: (λ: ${authFunName})`, err);
            reject(Boom.forbidden('User is not authorized to access this resource'));
            return;
          }

          console.info(`Authorization function returned a successful response: (λ: ${authFunName})`, JSON.stringify(policy));

          // Set the credentials for the rest of the pipeline
          resolve(h.authenticated({
            credentials: {
              context: policy.context,
              usageIdentifierKey: policy.usageIdentifierKey,
              user: policy.principalId
            }
          }));
        };

        if (result && typeof result.then === 'function') {
          result.then(onSuccess, onError);
        } else if (result instanceof Error) {
          onError(result);
        } else {
          onSuccess(result);
        }
      });

      const x = authFun(event, lambdaContext, lambdaContext.done);
      if (x && typeof x.then === 'function') {
        return x.then(lambdaContext.succeed, lambdaContext.fail);
      } else if (x instanceof Error) {
        return lambdaContext.fail(x);
      }
    });
  };
};

// noinspection JSUnusedGlobalSymbols
export default (authFun, authorizerOptions, options) => ({
  authenticate: createAuthenticateFunction(authorizerOptions, options, authFun)
});
