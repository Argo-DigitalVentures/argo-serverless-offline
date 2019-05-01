export const utils = {
  // Detect the toString encoding from the request headers content-type
  // enhance if further content types need to be non utf8 encoded.
  detectEncoding: request => typeof request.headers['content-type'] === 'string' && request.headers['content-type'].includes(
    'multipart/form-data') ? 'binary' : 'utf8',
  normalizeMultiValueQuery: query =>
    // foreach key, ensure that the value is an array
    Object.keys(query).reduce((q, param) => {
      q[param] = [].concat(query[param]);

      return q;
    }, {}),
  normalizeQuery: query =>
    // foreach key, get the last element if it's an array
    Object.keys(query).reduce((q, param) => {
      q[param] = [].concat(query[param]).pop();

      return q;
    }, {}),
  nullIfEmpty: o => o && (Object.keys(o).length > 0 ? o : null),
  randomId: () => Math.random().toString(10).slice(2)
};
