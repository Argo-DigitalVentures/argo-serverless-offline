"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (function (policyResource, resource) {
    // resource and policyResource are ARNs
    if (policyResource === resource) {
        return true;
    }
    else if (policyResource === '*') {
        return true;
    }
    else if (policyResource === 'arn:aws:execute-api:**') {
        // better fix for #523
        return true;
    }
    else if (policyResource.includes('*') || policyResource.includes('?')) {
        // Policy contains a wildcard resource
        var parsedPolicyResource = parseResource(policyResource);
        var parsedResource = parseResource(resource);
        if (parsedPolicyResource.region !== '*' && parsedPolicyResource.region !== parsedResource.region) {
            return false;
        }
        if (parsedPolicyResource.accountId !== '*' && parsedPolicyResource.accountId !== parsedResource.accountId) {
            return false;
        }
        if (parsedPolicyResource.restApiId !== '*' && parsedPolicyResource.restApiId !== parsedResource.restApiId) {
            return false;
        }
        // The path contains stage, method and the path
        // for the requested resource and the resource defined in the policy
        // Need to create a regex replacing ? with one character and * with any number of characters
        var re = new RegExp(parsedPolicyResource.path.replace(/\*/g, '.*').replace(/\?/g, '.'));
        return re.test(parsedResource.path);
    }
    return false;
});
function parseResource(resource) {
    var parts = resource.match(/arn:aws:execute-api:(.*?):(.*?):(.*?)\/(.*)/);
    var region = parts[1];
    var accountId = parts[2];
    var restApiId = parts[3];
    var path = parts[4];
    return { region: region, accountId: accountId, restApiId: restApiId, path: path };
}
//# sourceMappingURL=authMatchPolicyResource.js.map