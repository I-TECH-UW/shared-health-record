"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const winston_1 = __importDefault(require("../winston"));
const fhirclient_1 = __importDefault(require("fhirclient"));
const config_1 = __importDefault(require("../config"));
const ips_1 = require("../ips");
exports.router = express_1.default.Router();
var sprintf = require('sprintf-js').sprintf;
// TODO: add to config
const system = "urn:ietf:rfc:3986";
exports.router.get('/', (req, res) => {
    return res.status(200).send(req.url);
});
exports.router.get('/Patient/cruid/:id/:lastUpdated?', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const cruid = req.params.id;
    const lastUpdated = req.params.lastUpdated;
    const mpiUrl = config_1.default.get('fhirServer:mpiURL');
    const shrUrl = config_1.default.get('fhirServer:baseURL');
    winston_1.default.info(sprintf('Received a request for an ISP for patient with cruid: %s | lastUpdagted: %s', cruid, lastUpdated));
    const mpiClient = fhirclient_1.default(req, res).client({ serverUrl: mpiUrl, username: config_1.default.get('fhirServer:username'), password: config_1.default.get('fhirServer:password') });
    const shrClient = fhirclient_1.default(req, res).client({ serverUrl: shrUrl, username: config_1.default.get('fhirServer:username'), password: config_1.default.get('fhirServer:password') });
    // Fetch records for linked patients from MPI
    let mpiPatients = yield mpiClient.request(`Patient?_id=${cruid}&_include=Patient:link`, { flat: true });
    let ipsBundle = yield ips_1.generateIpsbundle(mpiPatients, shrClient, lastUpdated, system);
    res.status(200).json(ipsBundle);
}));
exports.router.get('/Patient/:id/:lastUpdated?', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const patientId = req.params.id;
    const lastUpdated = req.params.lastUpdated;
    const mpiUrl = config_1.default.get('fhirServer:mpiURL');
    const shrUrl = config_1.default.get('fhirServer:baseURL');
    winston_1.default.info(sprintf('Received a request for an ISP with a bundle of resources\npatient id: %s | lastUpdagted: %s', patientId, lastUpdated));
    // Create Client
    const mpiClient = fhirclient_1.default(req, res).client({ serverUrl: mpiUrl, username: config_1.default.get('fhirServer:username'), password: config_1.default.get('fhirServer:password') });
    const shrClient = fhirclient_1.default(req, res).client({ serverUrl: shrUrl, username: config_1.default.get('fhirServer:username'), password: config_1.default.get('fhirServer:password') });
    // Query MPI to get all patients
    // TODO: parameterize identifier specifics and account for diffent types of identifiers
    let goldenRecordRes = yield mpiClient.request(`Patient?identifier=${system}|${patientId}&_include=Patient:link`, { flat: true });
    let goldenRecord = goldenRecordRes.find((x) => (x.meta && x.meta.tag && x.meta.tag[0].code === "5c827da5-4858-4f3d-a50c-62ece001efea"));
    //let mpiPatients = await mpiClient.request<R4.IPatient[]>(`Patient?_id=4b3ddbf1-087c-43fb-85d0-4b78cddc6045`, { flat: true });
    if (goldenRecord) {
        let cruid = goldenRecord.id;
        let mpiPatients = yield mpiClient.request(`Patient?_id=${cruid}&_include=Patient:link`, { flat: true });
        let ipsBundle = yield ips_1.generateIpsbundle(mpiPatients, shrClient, lastUpdated, system);
        res.status(200).send(ipsBundle);
    }
    else {
        res.sendStatus(500);
    }
}));
exports.router.get('/:location?/:lastUpdated?', (req, res) => {
    const location = req.params.location;
    const lastUpdated = req.params.lastUpdated;
    const query = new URLSearchParams();
    const obsQuery = new URLSearchParams();
    if (lastUpdated) {
        query.set("_lastUpdated", lastUpdated);
        obsQuery.set("_lastUpdated", lastUpdated);
    }
    winston_1.default.info(sprintf('Received a request for an ISP with a bundle of resources\nlocation: %s | lastUpdagted: %s', location, lastUpdated));
    // Create Client
    const client = fhirclient_1.default(req, res).client({
        serverUrl: config_1.default.get('fhirServer:baseURL')
    });
    /**
     * For now:
     * 1. Set lastUpdated and location based on parameters
     * 2. Get all Patients that were lastUpdated and from a given location
     * 3. Get all Encounters that were lastUpdated and from a given location
     * 4. Get all Observations that were lastUpdated and from a given location
     * 5. Combine them into a single bundle w/ composition
     *
     */
    let patientP = client.request(`Patient?${query}`, { flat: true });
    if (location) {
        query.set("location", location);
        obsQuery.set("encounter.location", location);
    }
    let encounterP = client.request(`Encounter?${query}`, { flat: true });
    let obsP = client.request(`Observation?${obsQuery}`, { flat: true });
    Promise.all([patientP, encounterP, obsP])
        .then(values => {
        res.status(200).json(ips_1.generateUpdateBundle(values, location));
    })
        .catch(e => {
        res.status(500).render('error', { error: e });
    });
});
exports.default = exports.router;
//# sourceMappingURL=ips.js.map