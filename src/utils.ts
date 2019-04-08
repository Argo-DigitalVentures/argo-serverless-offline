export const utils = {
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
