"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const urijs_1 = __importDefault(require("urijs"));
const async_1 = __importDefault(require("async"));
const winston_1 = __importDefault(require("../winston"));
const config_1 = __importDefault(require("../config"));
exports.router = express_1.default.Router();
const fhirWrapper = require('../fhir')();
exports.router.get('/', (req, res) => {
    return res.status(200).send(req.url);
});
exports.router.get('/:resource/:id?', (req, res) => {
    getResource({
        req,
        noCaching: true
    }, (resourceData, statusCode) => {
        for (const index in resourceData.link) {
            if (!resourceData.link[index].url) {
                continue;
            }
            const urlArr = resourceData.link[index].url.split('fhir');
            if (urlArr.length === 2) {
                resourceData.link[index].url = '/fhir' + urlArr[1];
            }
        }
        res.status(statusCode).json(resourceData);
    });
});
// Post a bundle of resources
exports.router.post('/', (req, res) => {
    winston_1.default.info('Received a request to add a bundle of resources');
    const resource = req.body;
    // Verify that bundle
    if (!resource.resourceType ||
        (resource.resourceType && resource.resourceType !== 'Bundle') ||
        !resource.entry || (resource.entry && resource.entry.length === 0)) {
        return res.status(400).json({
            resourceType: "OperationOutcome",
            issue: [{
                    severity: "error",
                    code: "processing",
                    diagnostics: "Invalid bundle submitted"
                }],
            response: {
                status: 400
            }
        });
    }
    async_1.default.parallel({
        otherResources: (callback) => {
            if (resource.entry.length === 0) {
                return callback(null, {});
            }
            fhirWrapper.create(resource, (code, err, response, body) => {
                return callback(null, { code, err, response, body });
            });
        }
    }, (err, results) => {
        let code = results.otherResources.code;
        if (!code) {
            code = 500;
        }
        return res.status(code).json([results.patients.body, results.patients.body]);
    });
});
// Create resource
exports.router.post('/:resourceType', (req, res) => {
    saveResource(req, res);
});
// Update resource
exports.router.put('/:resourceType/:id', (req, res) => {
    saveResource(req, res);
});
/** Helpers */
function getResource({ req, noCaching }, callback) {
    const resource = req.params.resource;
    const id = req.params.id;
    let uri = urijs_1.default(config_1.default.get('fhirServer:baseURL'));
    winston_1.default.info('Received a request to get resource ' + resource + ' with id ' + id);
    if (resource) {
        uri = uri.segment(resource);
    }
    if (id) {
        uri = uri.segment(id);
    }
    for (const param in req.query) {
        uri.addQuery(param, req.query[param]);
    }
    let url = uri.toString();
    fhirWrapper.getResource({
        url,
        noCaching
    }, (resourceData, statusCode) => {
        return callback(resourceData, statusCode);
    });
}
function saveResource(req, res) {
    let resource = req.body;
    let resourceType = req.params.resourceType;
    let id = req.params.id;
    if (id && !resource.id) {
        resource.id = id;
    }
    winston_1.default.info('Received a request to add resource type ' + resourceType);
    if (resourceType === 'Patient') {
    }
    fhirWrapper.create(resource, (code, _err, _response, body) => {
        return res.status(code).send(body);
    });
}
exports.default = exports.router;
//# sourceMappingURL=fhir.js.map