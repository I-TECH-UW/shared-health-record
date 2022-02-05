"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got/dist/source";
import URI from "urijs";
import { saveLabBundle } from "../hapi/lab";
import config from "../lib/config";
import logger from "../lib/winston";
import { IBundle, BundleTypeKind } from '@ahryman40k/ts-fhir-types/lib/R4';

export default class Hl7WorkflowsBw {
  private static errorBundle: IBundle = {
    resourceType: "Bundle",
    type: BundleTypeKind._transactionResponse,
    entry: [{
      response: {
        status: "500 Server Error"
      }
    }]
  }

  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async saveOruMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedBundle = this.getHl7Translation(hl7Msg, "ORU_R01.hbs")

      if(translatedBundle != this.errorBundle) {
        // Save to SHR
        let resultBundle: R4.IBundle = await saveLabBundle(translatedBundle)
        return resultBundle
      } else {
        return this.errorBundle
      }


    } catch (error: any) {
      logger.error(`Could not save ORU message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async saveAdtMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedBundle: R4.IBundle = this.getHl7Translation(hl7Msg, "ADT_R04.hbs")
      
      if(translatedBundle != this.errorBundle) {
        // Save to SHR
        let resultBundle: R4.IBundle = await saveLabBundle(translatedBundle)
        return resultBundle
      } else {
        return this.errorBundle
      }

    } catch (error: any) {
      logger.error(`Could not translate and save ADT message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async getHl7Translation(hl7Message: string, template: string): R4.IBundle {
    try {
      return await got(
        {
          url: `${config.get("fhirConverterUrl")}/convert/hl7v2/${template}`,
          headers: {
            'content-type': 'text/plain'
          },
          body: hl7Message,
          method: "POST",
          https: {
            rejectUnauthorized: false
          }
        }
      ).json().fhirResource  
    } catch (error: any) {
      logger.error(`Could not translate HL7 message\n${hl7Message}\nwith template ${template}!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async getFhirTranslation(bundle: R4.IBundle, template: string) {
    try {
      return await got(
        {
          url: `${config.get("fhirConverterUrl")}/convert/fhir/${template}`,
          headers: {
            'content-type': 'application/json'
          },
          body: bundle,
          method: "POST",
          https: {
            rejectUnauthorized: false
          }
        }
      ).text()
    } catch (error: any) {
      logger.error(`Could not translate FHIR Bundle message\n${bundle}\nwith template ${template}!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }
}
