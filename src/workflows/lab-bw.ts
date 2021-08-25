"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got";
import { getTaskBundle } from "../hapi/lab";
import logger from "../lib/winston";
import { LaboratoryWorkflows } from "./lab";

export class LaboratoryWorkflowsBw extends LaboratoryWorkflows {

  // Add mapping info to bundle
  static async addBwMappings(bundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      for (const e of bundle.entry!) {
        if (e.resource && e.resource!.resourceType == "ServiceRequest") {
          e.resource = await this.translateCodings(e.resource!)
          e.resource = await this.translateLocations(e.resource)
        }
      }
    } catch (e) {
      logger.error(e)
    }

    return bundle
  }

  static generateLabBundle(task: R4.ITask, patient: R4.IPatient, serviceRequests?: R4.IServiceRequest[],
    practitioner?: R4.IPractitioner, targetOrg?: R4.IOrganization, sourceOrg?: R4.IOrganization): R4.IBundle {
    return super.generateLabBundle(task, patient, serviceRequests, practitioner, targetOrg, sourceOrg)
  }

  // Translate a Task Search Result Bundle into a Lab Doc Bundle
  static translateTaskBundle(taskBundle: R4.IBundle): R4.IBundle {
    return { resourceType: "Bundle" };
  }

  static async translateCodings(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
    try {
      let pimsCoding: R4.ICoding = <R4.ICoding>sr.code!.coding!.find(e => e.system &&
        e.system! == "https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-PROFILE-DICT/")
      let pimsCode: string = pimsCoding.code!

      let ipmsMapping: any = await got.get(`https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings?toConcept=${pimsCode}&toConceptSource=PIMS-LAB-TEST-DICT`).json()
      let ipmsCode: string = ipmsMapping.from_concept_code
      sr.code!.coding!.push({
        system: "https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-PROFILE-DICT/",
        code: ipmsCode
      })

      let cielMapping: any = await got.get(`https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCode}`).json()
      let cielCode: string = cielMapping.to_concept_code
      sr.code!.coding!.push({
        system: "https://api.openconceptlab.org/orgs/CIEL/sources/CIEL/",
        code: cielCode
      })

      let loincMapping: any = await got.get(`https://api.openconceptlab.org/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCode}&mapType=SAME-AS`).json()
      let loinCode: string = loincMapping.to_concept_code
      sr.code!.coding!.push({
        system: "https://api.openconceptlab.org/orgs/Regenstrief/sources/LOINC/",
        code: loinCode
      })

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