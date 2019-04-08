"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var authMatchPolicyResource_1 = require("./authMatchPolicyResource");
exports.default = (function (policy, resource) {
    var Statement = policy.Statement;
    // check for explicit deny
    var denyStatementFound = checkStatementsAgainstResource(Statement, resource, 'Deny');
    if (denyStatementFound) {
        return false;
    }
    return checkStatementsAgainstResource(Statement, resource, 'Allow');
});
function checkStatementsAgainstResource(Statement, resource, effect) {
    return Statement.some(function (statement) {
        var resourceArray = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
        return statement.Effect.toLowerCase() === effect.toLowerCase()
            && resourceArray.some(function (policyResource) { return (authMatchPolicyResource_1.default(policyResource, resource)); });
    });
}
//# sourceMappingURL=authCanExecuteResource.js.map