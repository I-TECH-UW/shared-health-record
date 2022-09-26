'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import {
  BundleTypeKind,
  IBundle,
  IDiagnosticReport,
  IPatient,
  IServiceRequest,
} from '@ahryman40k/ts-fhir-types/lib/R4'
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

      if (translatedBundle != this.errorBundle && translatedBundle.entry) {
        let patient: IPatient = <IPatient>(
          translatedBundle.entry.find(e => e.resource && e.resource.resourceType == 'Patient')!
            .resource!
        )

        let dr: IDiagnosticReport = <IDiagnosticReport>(
          translatedBundle.entry.find(
            e => e.resource && e.resource.resourceType == 'DiagnosticReport',
          )!.resource!
        )

        let drCode =
          dr.code && dr.code.coding && dr.code.coding.length > 0 ? dr.code.coding[0].code : ''

        let omang
        let omangEntry = patient.identifier?.find(
          i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
        )

        if (omangEntry) {
          omang = omangEntry.value!
        } else {
          omang = ''
        }

        let options = {
          timeout: config.get('bwConfig:requestTimeout'),
          searchParams: {},
        }

        // Find all active service requests with dr code with this Omang.
        options.searchParams = {
          identifier: `${config.get('bwConfig:omangSystemUrl')}|${omang}`,
          _revinclude: 'ServiceRequest:patient',
        }

        let patientBundle: IBundle = await got
          .get(`${config.get('fhirServer:baseURL')}/Patient`, options)
          .json()

        if (patientBundle && patientBundle.entry && patientBundle.entry.length > 0) {
          let candidates: IServiceRequest[] = patientBundle.entry
            .filter(
              e =>
                e.resource &&
                e.resource.resourceType == 'ServiceRequest' &&
                e.resource.status &&
                e.resource.status == 'active' &&
                e.resource.code &&
                e.resource.code.coding &&
                e.resource.code.coding.length > 0,
            )
            .map(e => <IServiceRequest>e.resource)

          let primaryCandidate: IServiceRequest = candidates.find(c => {
            if (c && c.code && c.code.coding) {
              let candidateCode = c.code.coding.find(
                co =>
                  co.system ==
                  'https://api.openconceptlab.org/orgs/B-TECHBW/sources/IPMS-LAB-TEST/',
              )
              return candidateCode && candidateCode.code == drCode
            }
            return false
          })

          // Update DR based on primary candidate details
          // Update Obs based on primary candidate details
          // Save
        }

        // Save to SHR
        let resultBundle: R4.IBundle = await saveBundle(translatedBundle)

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
