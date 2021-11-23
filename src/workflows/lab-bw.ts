"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got";
import logger from "../lib/winston";
import { LaboratoryWorkflows } from "./lab";
import { v4 as uuidv4 } from 'uuid';
import { sendPayload } from "../lib/kafka"

export class LaboratoryWorkflowsBw extends LaboratoryWorkflows {
  static async handleBwLabOrder(orderBundle: R4.IBundle) {
    try {
      sendPayload(orderBundle, "pims-order")
    } catch (e) {
      logger.error(e)
    }
  }

  // Add mapping info to bundle
  static async addBwMappings(bundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      for (const e of bundle.entry!) {
        if (e.resource && e.resource.resourceType == "ServiceRequest" && e.resource.basedOn) {
          e.resource = await this.translatePimsCoding(e.resource)
        }
      }
    } catch (e) {
      logger.error(e)
    }

    return bundle
  }

  static async translatePimsCoding(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
    try {
      let pimsCoding: R4.ICoding = <R4.ICoding>sr.code!.coding!.find(e => e.system &&
        e.system == "https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-TEST-DICT/")
      let pimsCode: string = pimsCoding.code!

      let ipmsMapping: any = await got.get(`https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings?toConcept=${pimsCode}&toConceptSource=PIMS-LAB-TEST-DICT`).json()
      let ipmsCode: string = ipmsMapping[0].from_concept_code
      if (ipmsMapping.length > 0) {
        sr.code!.coding!.push({
          system: "https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/",
          code: ipmsCode,
          display: ipmsMapping[0].from_concept_name_resolved
        })
      }

      let cielMapping: any = await got.get(`https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCode}`).json()
      let cielCode: string = cielMapping[0].to_concept_code
      if (cielMapping.length > 0) {
        sr.code!.coding!.push({
          system: "https://api.openconceptlab.org/orgs/CIEL/sources/CIEL/",
          code: cielCode,
          display: cielMapping[0].to_concept_name_resolved
        })
      }

      let loincMapping: any = await got.get(`https://api.openconceptlab.org/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCode}&mapType=SAME-AS`).json()
      if (loincMapping.length > 0) {
        let loinCode: string = loincMapping[0].to_concept_code
        sr.code!.coding!.push({
          system: "https://api.openconceptlab.org/orgs/Regenstrief/sources/LOINC/",
          code: loinCode
        })
      }
    } catch (e) {
      logger.error(`Could not translate ServiceRequest codings: \n ${e}`)
    }
    return sr
  }

  static async translateLocations(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
    logger.info("Not Implemented yet!")

    return sr
  }

  static generateIpmsResults(entries: R4.IBundle_Entry[]): R4.IBundle_Entry[] {
    let generatedResults: R4.IBundle_Entry[] = []

    for (let entry of entries) {
      let resource = entry.resource
      if (resource && resource.resourceType == "ServiceRequest" && resource.basedOn && resource.status! == "active") {
        let sr = resource
        if (sr.code && sr.code.coding && sr.code.coding.length > 0) {
          if (sr.code.coding[0].code == '1' && sr.code.coding[0].system == "https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-TEST-DICT/") {
            generatedResults = generatedResults.concat(this.generateCD4Results(sr))
          }
          if (sr.code.coding[0].code == '3' && sr.code.coding[0].system == "https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-TEST-DICT/") {
            generatedResults = generatedResults.concat(this.generateViralLoadResults(sr))
          }
        }
      }
    }
    return entries.concat(generatedResults)
  }
  
  private static generateCD4Results(sr: R4.IServiceRequest): R4.IBundle_Entry[] {
    let cellCount = Math.floor(Math.random() * 40)
    let obsId = "ipms-obs-" + uuidv4();
    let obs: R4.IObservation = {
      resourceType: "Observation",
      id: obsId,
      code: sr.code!,
      status: R4.ObservationStatusKind._final,
      valueQuantity: {
        value: cellCount,
        unit: "cells per microliter",
        system: "http://hl7.org/fhir/ValueSet/ucum-units",
        code: "{cells}/uL"
      },
      interpretation: [{
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "L" }]
      }],
      referenceRange: [{
        low: {
          value: 50,
          unit: "cells per microliter",
          system: "http://hl7.org/fhir/ValueSet/ucum-units",
          code: "{cells}/uL"
        },
        high: {
          value: 150,
          unit: "cells per microliter",
          system: "http://hl7.org/fhir/ValueSet/ucum-units",
          code: "{cells}/uL"
        }
      }],
      performer: sr.performer,
      basedOn: [{ reference: "ServiceRequest/" + sr.id }]
    }

    let dr = this.getTemplateDR(sr, obsId)

    return this.packageResults(dr, obs)

  }

  private static generateViralLoadResults(sr: R4.IServiceRequest): R4.IBundle_Entry[] {
    let viralLoad = Math.floor(Math.random() * 100000) + 50000
    let obsId = "ipms-obs-" + uuidv4()
    let obs: R4.IObservation = {
      resourceType: "Observation",
      id: obsId,
      code: sr.code!,
      status: R4.ObservationStatusKind._final,
      valueQuantity: {
        value: viralLoad,
        unit: "copies per milliliter",
        system: "http://hl7.org/fhir/ValueSet/ucum-units",
        code: "{copies}/mL"
      },
      interpretation: [{
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "L" }]
      }],
      referenceRange: [{
        high: {
          value: 100000,
          unit: "copies per milliliter",
          system: "http://hl7.org/fhir/ValueSet/ucum-units",
          code: "{copies}/mL"
        }
      }],
      performer: sr.performer,
      basedOn: [{ reference: "ServiceRequest/" + sr.id }]
    }

    let dr = this.getTemplateDR(sr, obsId)

    return this.packageResults(dr, obs)

  }

  private static packageResults(dr: R4.IDiagnosticReport, obs: R4.IObservation): R4.IBundle_Entry[] {
    let resPackage: R4.IBundle_Entry[] = []

    resPackage.push({
      resource: dr
    })

    resPackage.push({
      resource: obs
    })

    return resPackage
  }

  private static getTemplateDR(sr: R4.IServiceRequest, obsId: string): R4.IDiagnosticReport {
    let drId = "ipms-dr-" + uuidv4();

    return {
      id: drId,
      resourceType: "DiagnosticReport",
      code: sr.code!,
      basedOn: [{ reference: "ServiceRequest/" + sr.id }],
      status: R4.DiagnosticReportStatusKind._final,
      subject: sr.subject,
      result: [{ reference: "Observation/" + obsId }]
    }
  }
}


