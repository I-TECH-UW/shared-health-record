'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got/dist/source'
import config from '../../lib/config'
import logger from '../../lib/winston'
import { WorkflowHandler, topicList } from './workflowHandler'
import sleep from 'sleep-promise'

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
      const translatedBundle: R4.IBundle = await Hl7WorkflowsBw.translateBundle(
        hl7Msg,
        'bwConfig:fromIpmsOruTemplate',
      )

      if (translatedBundle != this.errorBundle && translatedBundle.entry) {
        WorkflowHandler.sendPayload({ bundle: translatedBundle }, topicList.HANDLE_ORU_FROM_IPMS)
        return translatedBundle
      } else {
        return this.errorBundle
      }
    } catch (error: any) {
      logger.error(`Could not save ORU message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async handleAdtMessage(hl7Msg: string): Promise<void> {
    try {
      WorkflowHandler.sendPayload({ message: hl7Msg }, topicList.HANDLE_ADT_FROM_IPMS)
    } catch (error: any) {
      // TODO: Major Error - send to DMQ or handle otherwise
      logger.error(`Could not translate and save ADT message!\n${JSON.stringify(error)}`)
    }
  }

  static async translateBundle(hl7Msg: string, template: string) {
    let tries = 0
    let translatedBundle: R4.IBundle = this.errorBundle

    while (tries < 5 && translatedBundle == this.errorBundle) {
      tries = tries + 1
      translatedBundle = await this.getHl7Translation(hl7Msg, config.get(template))
      if (translatedBundle == this.errorBundle) {
        await sleep(1000)
      }
    }
    return translatedBundle
  }

  static async getHl7Translation(hl7Message: string, template: string): Promise<R4.IBundle> {
    try {
      const translatedMessage: any = await got({
        url: `${config.get('fhirConverterUrl')}/convert/hl7v2/${template}`,
        headers: {
          'content-type': 'text/plain',
        },
        body: hl7Message.replace(/\r/g, '\n'),
        method: 'POST',
        https: {
          rejectUnauthorized: false,
        },
        username: config.get('mediator:client:username'),
        password: config.get('mediator:client:password'),
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
        username: config.get('mediator:client:username'),
        password: config.get('mediator:client:password'),
      }).text()
    } catch (error: any) {
      logger.error(
        `Could not translate FHIR Bundle message\n${JSON.stringify(
          bundle,
        )}\n with template ${template}!\n${JSON.stringify(error)}`,
      )
      return ''
    }
  }
}
