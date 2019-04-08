"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utils = {
    normalizeMultiValueQuery: function (query) {
        // foreach key, ensure that the value is an array
        return Object.keys(query).reduce(function (q, param) {
            q[param] = [].concat(query[param]);
            return q;
        }, {});
    },
    normalizeQuery: function (query) {
        // foreach key, get the last element if it's an array
        return Object.keys(query).reduce(function (q, param) {
            q[param] = [].concat(query[param]).pop();
            return q;
        }, {});
    },
    nullIfEmpty: function (o) { return o && (Object.keys(o).length > 0 ? o : null); },
    randomId: function () { return Math.random().toString(10).slice(2); }
};
//# sourceMappingURL=utils.js.map