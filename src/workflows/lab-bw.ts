"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got";
import logger from "../lib/winston";
import { LaboratoryWorkflows } from "./lab";

export class LaboratoryWorkflowsBw extends LaboratoryWorkflows {

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

}