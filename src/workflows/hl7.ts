"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got/dist/source";
import URI from "urijs";
import { saveLabBundle } from "../hapi/lab";
import config from "../lib/config";
import logger from "../lib/winston";
export class hl7Workflows {
  
  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async saveOruMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedResult: any = await got(
        {
          url: config.get("fhirConverterUrl") + "/convert/hl7v2/ORU_R01.hbs",
          headers: {
            'content-type': 'text/plain'
          },
          body: hl7Msg,
          method: "POST",
          https: {
            rejectUnauthorized: false
          }
        }
      ).json()

      let translatedBundle = <R4.IBundle>translatedResult.fhirResource

      // Save to SHR
      let resultBundle: R4.IBundle = await saveLabBundle(translatedBundle)

      return resultBundle

    } catch (error: any) {
      logger.error(`Could not translate and save ORU message!\n${JSON.stringify(error)}`)
      
      throw new Error(`Could not translate ORU message!\n${JSON.stringify(error)}`)
    }
  }

  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async saveAdtMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedResult: any = await got(
        {
          url: config.get("fhirConverterUrl") + "/convert/hl7v2/ORU_R01.hbs",
          headers: {
            'content-type': 'text/plain'
          },
          body: hl7Msg,
          method: "POST",
          https: {
            rejectUnauthorized: false
          }
        }
      ).json()

      let translatedBundle = <R4.IBundle>translatedResult.fhirResource

      // Save to SHR
      let resultBundle: R4.IBundle = await saveLabBundle(translatedBundle)

      return resultBundle

    } catch (error: any) {
      logger.error(`Could not translate and save ORU message!\n${JSON.stringify(error)}`)
      
      throw new Error(`Could not translate ORU message!\n${JSON.stringify(error)}`)
    }
  }

  // Translate a Task and associated ServiceRequests into HL7v2 (OBR)
  static translateTaskBundle(bundle: R4.IBundle) {
    // For each Task:
    // 1. grab all profile-level service requests 
    //  

  }

  // Translate a ServiceRequest hierarchy into HL7v2 (OBR)
  static translateServiceRequestBundle(bundle: R4.IBundle) {

  }

  private async processSearchBundle() {
    // Paginate through results
    let nextExists = false;
    do {
      let searchBundle: any = await got.get(URI.toString()).json()

      if (searchBundle.entry && searchBundle.entry.length > 0) {
        for (const serviceRequest of searchBundle.entry) {

        }
      }


      if (searchBundle.next) {

      }
    } while (nextExists);
  }
}