'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got/dist/source'
import { saveBundle } from '../hapi/lab'
import config from '../lib/config'
import logger from '../lib/winston'
import { sendPayload } from '../lib/kafka'
import { topicList } from './labWorkflowsBw'

export default class Hl7WorkflowsBw {
  public static errorBundle: IBundle = {
    resourceType: 'Bundle',
    type: BundleTypeKind._transactionResponse,
    entry: [
      {
        response: {
          status: '500 Server Error',
        },
      },
    ],
  }

  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async handleOruMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedBundle: R4.IBundle = await this.getHl7Translation(
        hl7Msg,
        config.get('bwConfig:fromIpmsOruTemplate'),
      )

      if (translatedBundle != this.errorBundle) {
        // Save to SHR
        let resultBundle: R4.IBundle = await saveBundle(translatedBundle)

        // TODO: handle matching to update the Task and ServiceRequests with status/results

        return resultBundle
      } else {
        return this.errorBundle
      }
    } catch (error: any) {
      logger.error(`Could not save ORU message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async handleAdtMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      let translatedBundle: R4.IBundle = await this.getHl7Translation(
        hl7Msg,
        config.get('bwConfig:fromIpmsAdtTemplate'),
      )

      if (translatedBundle != this.errorBundle) {
        // Save to SHR
        let resultBundle: R4.IBundle = await saveBundle(translatedBundle)

        sendPayload(
          { bundle: translatedBundle, response: resultBundle },
          topicList.SAVE_IPMS_PATIENT,
        )

        return resultBundle
      } else {
        return this.errorBundle
      }
    } catch (error: any) {
      logger.error(`Could not translate and save ADT message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async getHl7Translation(hl7Message: string, template: string): Promise<R4.IBundle> {
    try {
      let translatedMessage: any = await got({
        url: `${config.get('fhirConverterUrl')}/convert/hl7v2/${template}`,
        headers: {
          'content-type': 'text/plain',
        },
        body: hl7Message,
        method: 'POST',
        https: {
          rejectUnauthorized: false,
        },
      }).json()

      return translatedMessage.fhirResource
    } catch (error: any) {
      logger.error(
        `Could not translate HL7 message\n${hl7Message}\nwith template ${template}!\n${JSON.stringify(
          error,
        )}`,
      )
      return this.errorBundle
    }
  }

  static async getFhirTranslation(bundle: R4.IBundle, template: string): Promise<string> {
    try {
      return await got({
        url: `${config.get('fhirConverterUrl')}/convert/fhir/${template}`,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(bundle),
        method: 'POST',
        https: {
          rejectUnauthorized: false,
        },
      }).text()
    } catch (error: any) {
      logger.error(
        `Could not translate FHIR Bundle message\n${bundle}\nwith template ${template}!\n${JSON.stringify(
          error,
        )}`,
      )
      return ''
    }
  }
}
