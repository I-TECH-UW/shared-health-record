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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUpdateBundle = exports.generateIpsbundle = void 0;
const ts_fhir_types_1 = require("@ahryman40k/ts-fhir-types");
// Generating an IPS Bundle (https://build.fhir.org/ig/HL7/fhir-ips/)
// List of Resources: 
/*
    Medication Summary (R)
    Allergies and Intolerances (R)
    Problem List (R)
    Immunizations (S)
    History of Procedures (S)
    Medical Devices (S)
    Diagnostic Results (S)
    Laboratory results
    Pathology results
    Past history of illnesses
    Pregnancy (status and history summary)
    Social History
    Functional Status (Autonomy / Invalidity)
    Plan of care
    Advance Directives
*/
function generateIpsbundle(patients, shrClient, lastUpdated, system) {
    return __awaiter(this, void 0, void 0, function* () {
        let patientIdentifiers = grabTargetIdentifiers(patients, system);
        const query = new URLSearchParams();
        query.set("subject", patientIdentifiers.join(','));
        query.set("_lastUpdated", lastUpdated);
        // Fetch SHR components
        /**
         * Get Encounters where: relevant to medical summary
         * Get AllergyIntolerance
         * Get observations relevant to problem lists
         * Get observations relevant to immunizations
         * Get observations relevant to diagnostic results
         * Get observations relevant to labs
         * Get plan of care?
        */
        let shrPatients = yield shrClient.request(`Patient?_id=${patientIdentifiers.join(',')}`, { flat: true });
        let encounters = yield shrClient.request(`Encounter?${query}`, { flat: true });
        let observations = yield shrClient.request(`Observation?${query}`, { flat: true });
        let ipsBundle = {
            resourceType: "Bundle"
        };
        let ipsCompositionType = {
            coding: [{ system: "http://loinc.org", code: "60591-5", display: "Patient summary Document" }]
        };
        let ipsComposition = {
            resourceType: "Composition",
            type: ipsCompositionType,
            author: [{ display: "SHR System" }],
            section: [
                {
                    title: "Patient Records",
                    entry: shrPatients.map((p) => { return { reference: `Patient/${p.id}` }; })
                },
                {
                    title: "Encounters",
                    entry: encounters.map((e) => { return { reference: `Encounter/${e.id}` }; })
                },
                {
                    title: "Observations",
                    entry: observations.map((o) => { return { reference: `Observation/${o.id}` }; })
                }
            ]
        };
        ipsBundle.type = ts_fhir_types_1.R4.BundleTypeKind._document;
        ipsBundle.entry = [];
        ipsBundle.entry.push(ipsComposition);
        ipsBundle.entry = ipsBundle.entry.concat(shrPatients);
        ipsBundle.entry = ipsBundle.entry.concat(encounters);
        ipsBundle.entry = ipsBundle.entry.concat(observations);
        return ipsBundle;
    });
}
exports.generateIpsbundle = generateIpsbundle;
function generateUpdateBundle(values, lastUpdated, location) {
    let patients = values[0];
    let encounters = values[1];
    let observations = values[2];
    // Filter patients here since location is not queryable
    if (patients.length > 0 && location) {
        patients = patients.filter((p) => {
            if (p.identifier && p.identifier.length > 0 && p.identifier[0].extension) {
                return p.identifier[0].extension[0].valueReference.reference.includes(location);
            }
            else {
                return false;
            }
        });
    }
    let ipsBundle = {
        resourceType: "Bundle"
    };
    // let ipsCompositionType: R4.ICodeableConcept = {
    //     coding: [{ system: "http://loinc.org", code: "60591-5", display: "Patient summary Document" }]
    // };
    let ipsCompositionType = {
        text: "iSantePlus Instance Update Bundle"
    };
    let ipsComposition = {
        resourceType: "Composition",
        type: ipsCompositionType,
        author: [{ display: "SHR System" }],
        section: [
            {
                title: "Patients",
                entry: patients.map((p) => { return { reference: `Patient/${p.id}` }; })
            },
            {
                title: "Encounters",
                entry: encounters.map((e) => { return { reference: `Encounter/${e.id}` }; })
            },
            {
                title: "Observations",
                entry: observations.map((o) => { return { reference: `Observation/${o.id}` }; })
            }
        ]
    };
    // Create Document Bundle
    ipsBundle.type = ts_fhir_types_1.R4.BundleTypeKind._document;
    ipsBundle.entry = [];
    ipsBundle.entry.push(ipsComposition);
    ipsBundle.entry = ipsBundle.entry.concat(patients);
    ipsBundle.entry = ipsBundle.entry.concat(encounters);
    ipsBundle.entry = ipsBundle.entry.concat(observations);
    return ipsBundle;
}
exports.generateUpdateBundle = generateUpdateBundle;
function grabTargetIdentifiers(patients, system) {
    // Filter results for unique idenitifers with the correct system 
    return patients.map((patient) => {
        if (patient.identifier) {
            let targetId = patient.identifier.find((i) => {
                return (i.system && i.system === system);
            });
            if (targetId && targetId.value) {
                let uuid = targetId.value.split("/").pop();
                if (uuid) {
                    return uuid;
                }
            }
        }
        return "";
    }).filter(i => i != "");
}
//# sourceMappingURL=ips.js.map