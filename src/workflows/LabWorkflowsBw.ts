"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got";
import logger from "../lib/winston";
import { LabWorkflows } from "./labWorkflows";
import { sendPayload } from "../lib/kafka"
import { saveLabBundle } from "../hapi/lab";
import Hl7WorkflowsBw from "./hl7WorkflowsBw";

const hl7 = require('hl7')

export class LabWorkflowsBw extends LabWorkflows {
  static async handleBwLabOrder(orderBundle: R4.IBundle, resultBundle: R4.IBundle) {
    try {
      sendPayload({bundle: orderBundle, response: resultBundle}, "map-concepts")
    } catch (e) {
      logger.error(e)
    }
  }

  // Add coding mappings info to bundle
  static async addBwCodings(bundle: R4.IBundle): Promise<R4.IBundle> {
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

  // Add location info to bundle
  static async addBwLocations(bundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      for (const e of bundle.entry!) {
        if (e.resource && e.resource.resourceType == "ServiceRequest" && e.resource.basedOn) {
          e.resource = await this.translateLocations(e.resource)
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

      let loincMapping = got.get(`https://api.openconceptlab.org/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCode}&mapType=SAME-AS`).json()
      loincMapping.catch(logger.error).then((lm: any) => {
        if (lm.length > 0) {
          let loinCode: string = lm[0].to_concept_code
          sr.code!.coding!.push({
            system: "https://api.openconceptlab.org/orgs/Regenstrief/sources/LOINC/",
            code: loinCode
          })
        }
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

 
  /**
   * 
   * @param labBundle 
   * @returns 
   */
  public static async mapConcepts(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info("Mapping Concepts!");

    labBundle = await LabWorkflowsBw.addBwCodings(labBundle)
    let response: R4.IBundle = await saveLabBundle(labBundle)
    
    sendPayload(labBundle, "map-locations")

    return response
  }

  /**
   * 
   * @param labBundle 
   * @returns 
   */
  public static async mapLocations(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info("Mapping Locations!");
    
    labBundle = await LabWorkflowsBw.addBwLocations(labBundle)
    let response: R4.IBundle = await saveLabBundle(labBundle)
    
    sendPayload(labBundle, "send-ipms-message")

    return response
  } 

  /**
   * Overview of IPMS Order Creation Workflow
   * 1. Send a HL7 ADT message to IPMS over MLLP and recieve response with Patient MRN
   * 2. Translate Lab Bundle into OBR Message
   * 3. Add Patient MRN to OBR Message
   * 4. Send OBR Message to IPMS
   * 3. Add IPMS Patient with IPMS MRN to CR
   * 4. Update SHR Patient with IPMS MRN 
   * @param val 
   * @returns 
   */
  public static async createIpmsOrder(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info("Sending IPMS Order!");



    // let hl7Oru = Hl7WorkflowsBw.getHl7Translation();

    // return response;
    return labBundle
  }
}


