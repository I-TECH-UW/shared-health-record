"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import fhirClient from 'fhirclient';
import Client from "fhirclient/lib/Client";


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

export async function generateIpsbundle(patients: R4.IPatient[], shrClient: Client, lastUpdated: string, system: string): Promise<R4.IBundle> {
    let patientIdentifiers = grabTargetIdentifiers(patients, system)
    const query = new URLSearchParams();

    query.set("subject", patientIdentifiers.join(','))
    query.set("_lastUpdated", lastUpdated)

    
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
    let shrPatients = await shrClient.request<R4.IPatient[]>(`Patient?_id=${patientIdentifiers.join(',')}`, { flat: true });
    let encounters = await shrClient.request<R4.IEncounter[]>(`Encounter?${query}`, { flat: true });
    let observations = await shrClient.request<R4.IObservation[]>(`Observation?${query}`, { flat: true });
    
    let ipsBundle: R4.IBundle = {
        resourceType: "Bundle"
    };
    
    let ipsCompositionType: R4.ICodeableConcept = {
        coding: [{ system: "http://loinc.org", code: "60591-5", display: "Patient summary Document" }]
    };

    let ipsComposition: R4.IComposition = {
        resourceType: "Composition",
        type: ipsCompositionType,
        author: [{ display: "SHR System" }],
        section: [
            {
                title: "Patient Records",
                entry: shrPatients.map((p: R4.IPatient) => { return { reference: `Patient/${p.id!}` } })
            },
            {
                title: "Encounters",
                entry: encounters.map((e: R4.IEncounter) => { return { reference: `Encounter/${e.id!}` } })
            },
            {
                title: "Observations",
                entry: observations.map((o: R4.IObservation) => { return { reference: `Observation/${o.id!}` } })
            }
        ]
    }

    ipsBundle.type = R4.BundleTypeKind._document
    ipsBundle.entry = [];
    ipsBundle.entry.push(ipsComposition);
    ipsBundle.entry = ipsBundle.entry.concat(shrPatients);
    ipsBundle.entry = ipsBundle.entry.concat(encounters);
    ipsBundle.entry = ipsBundle.entry.concat(observations);
    

    return ipsBundle;
}


export function generateUpdateBundle(values: R4.IDomainResource[][], lastUpdated?: string, location?: string): R4.IBundle {
    let patients: R4.IPatient[] = <R4.IPatient[]>values[0];
    let encounters: R4.IEncounter[] = <R4.IEncounter[]>values[1];
    let observations: R4.IObservation[] = <R4.IObservation[]>values[2];

    // Filter patients here since location is not queryable
    if (patients.length > 0 && location) {
        patients = patients.filter((p: R4.IPatient) => {
            if (p.identifier && p.identifier.length > 0 && p.identifier[0].extension) {
                return p.identifier[0].extension[0].valueReference!.reference!.includes(location);
            } else {
                return false;
            }
        });
    }

    let ipsBundle: R4.IBundle = {
        resourceType: "Bundle"
    };

    // let ipsCompositionType: R4.ICodeableConcept = {
    //     coding: [{ system: "http://loinc.org", code: "60591-5", display: "Patient summary Document" }]
    // };

    let ipsCompositionType: R4.ICodeableConcept = {
        text: "iSantePlus Instance Update Bundle"
    };


    let ipsComposition: R4.IComposition = {
        resourceType: "Composition",
        type: ipsCompositionType,
        author: [{ display: "SHR System" }],
        section: [
            {
                title: "Patients",
                entry: patients.map((p: R4.IPatient) => { return { reference: `Patient/${p.id!}` } })
            },
            {
                title: "Encounters",
                entry: encounters.map((e: R4.IEncounter) => { return { reference: `Encounter/${e.id!}` } })
            },
            {
                title: "Observations",
                entry: observations.map((o: R4.IObservation) => { return { reference: `Observation/${o.id!}` } })
            }

        ]
    }

    // Create Document Bundle
    ipsBundle.type = R4.BundleTypeKind._document
    ipsBundle.entry = [];
    ipsBundle.entry.push(ipsComposition);
    ipsBundle.entry = ipsBundle.entry.concat(patients);
    ipsBundle.entry = ipsBundle.entry.concat(encounters);
    ipsBundle.entry = ipsBundle.entry.concat(observations);
    
    return ipsBundle;
}

function grabTargetIdentifiers(patients: R4.IPatient[], system: string): string[] {
// Filter results for unique idenitifers with the correct system 
  return patients.map<string>((patient) => {
    if(patient.identifier) {
      let targetId = patient.identifier.find((i: R4.IIdentifier) => {
        return (i.system && i.system === system);
      })

      if(targetId && targetId.value) {
        let uuid = targetId.value.split("/").pop();
        if(uuid){
          return uuid;
        }
      }
    }
    return "";
  }).filter(i => i != "");
}