'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import { IBundle, IPatient, RTTI_Bundle, TaskStatusKind } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got'
import { send } from 'process'
import { saveBundle } from '../hapi/lab'
import config from '../lib/config'
import Hl7MllpSender from '../lib/hl7MllpSender'
import { sendPayload } from '../lib/kafka'
import logger from '../lib/winston'
import Hl7WorkflowsBw from './hl7WorkflowsBw'
import { LabWorkflows } from './labWorkflows'

const hl7 = require('hl7')

export const topicList = {
  MAP_CONCEPTS: 'map-concepts',
  MAP_LOCATIONS: 'map-locations',
  SEND_ADT_TO_IPMS: 'send-adt-to-ipms',
  SEND_ORM_TO_IPMS: 'send-orm-to-ipms',
  SAVE_PIMS_PATIENT: 'save-pims-patient',
  SAVE_IPMS_PATIENT: 'save-ipms-patient',
}

export class LabWorkflowsBw extends LabWorkflows {
  /**
   *
   * To handle a lab order from the PIMS system (https://www.postman.com/itechuw/workspace/botswana-hie/collection/1525496-db80feab-8a77-42c8-aa7e-fd4beb0ae6a8)
   *
   * 1. PIMS sends Lab bundle to SHR (postman trigger)
   * 2. SHR saves bundle and patient, and sets bundle status --> Requested (postman test)
   * 3. SHR saves patient in CR (postman test)
   * 3. SHR translates bundle --> ADT04 HL7 Message (postman request - ADT04_to_IPMS.hbs)
   * 4. SHR sends HL7 Message to IPMS (Request Interceptor Needed - mllp interceptor?)
   *
   * ----- async -----
   * 5. IPMS sends registration message to SHR (mllp test trigger)
   * 6. SHR translates message --> Patient Resource (postman request)
   * 7. Search for patient by some data from patient resource, like Omang / passport # / etc.) (postman request)
   * 8. Get all Task Bundles where status is Requested for the patient in the SHR (postman request)
   * 9. Send patient resource --> CR (postman test)
   * For each Bundle:
   * 10. Translate to ORM message (postman request)
   * 11. Send ORM HL7 message to IPMS and get back ACK  (Request Interceptor Needed - mllp interceptor?)
   * 12. Set Task status --> received / accepted / rejected (postman test)
   *
   * @param orderBundle
   * @param resultBundle
   */

  static async handleBwLabOrder(orderBundle: R4.IBundle, resultBundle: R4.IBundle) {
    try {
      sendPayload({ bundle: orderBundle, response: resultBundle }, topicList.MAP_CONCEPTS)
    } catch (e) {
      logger.error(e)
    }
  }

  static async executeTopicWorkflow(topic: String, val: any) {
    let res
    try {
      switch (topic) {
        case topicList.MAP_CONCEPTS:
          res = await LabWorkflowsBw.mapConcepts(JSON.parse(val).bundle)
          break
        case topicList.MAP_LOCATIONS:
          res = await LabWorkflowsBw.mapLocations(JSON.parse(val).bundle)
          break
        case topicList.SAVE_PIMS_PATIENT:
          res = await LabWorkflowsBw.updateCrPatient(JSON.parse(val).bundle)
          break
        case topicList.SEND_ADT_TO_IPMS:
          res = await LabWorkflowsBw.sendAdtToIpms(JSON.parse(val).bundle)
          break
        case topicList.SAVE_IPMS_PATIENT:
          res = await LabWorkflowsBw.saveIpmsPatient(JSON.parse(val).bundle)
          break
        case topicList.SEND_ORM_TO_IPMS:
          res = await LabWorkflowsBw.sendOrmToIpms(JSON.parse(val).bundle)
          break
        default:
          break
      }
    } catch (e) {
      logger.error(e)
    }
  }

  // Add coding mappings info to bundle
  static async addBwCodings(bundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      for (const e of bundle.entry!) {
        if (e.resource && e.resource.resourceType == 'ServiceRequest' && e.resource.basedOn) {
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
        if (e.resource && e.resource.resourceType == 'ServiceRequest' && e.resource.basedOn) {
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
      let options = { timeout: config.get('bwConfig:requestTimeout') }
      let pimsCoding: R4.ICoding = <R4.ICoding>(
        sr.code!.coding!.find(e => e.system && e.system == config.get('bwConfig:pimsSystemUrl'))
      )
      let pimsCode: string = pimsCoding.code!

      let ipmsMapping: any = await got
        .get(
          `${config.get(
            'bwConfig:oclUrl',
          )}/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings?toConcept=${pimsCode}&toConceptSource=PIMS-LAB-TEST-DICT`,
          options,
        )
        .json()
      let ipmsCode: string = ipmsMapping[0].from_concept_code
      if (ipmsMapping.length > 0) {
        sr.code!.coding!.push({
          system: `${config.get('bwConfig:oclUrl')}/orgs/B-TECHBW/sources/IPMS-LAB-TEST/`,
          code: ipmsCode,
          display: ipmsMapping[0].from_concept_name_resolved,
        })
      }

      let cielMapping: any = await got
        .get(
          `${config.get(
            'bwConfig:oclUrl',
          )}/orgs/B-TECHBW/sources/IPMS-LAB-TEST/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCode}`,
          options,
        )
        .json()
      let cielCode: string = cielMapping[0].to_concept_code
      if (cielMapping.length > 0) {
        sr.code!.coding!.push({
          system: 'https://api.openconceptlab.org/orgs/CIEL/sources/CIEL/',
          code: cielCode,
          display: cielMapping[0].to_concept_name_resolved,
        })
      }

      let loincMapping = got
        .get(
          `${config.get(
            'bwConfig:oclUrl',
          )}/orgs/CIEL/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCode}`,
          options,
        )
        .json()
      await loincMapping.catch(logger.error).then((lm: any) => {
        if (lm.length > 0) {
          let loinCode: string = lm[0].to_concept_code
          sr.code!.coding!.push({
            system: `${config.get('bwConfig:oclUrl')}/orgs/Regenstrief/sources/LOINC/`,
            code: loinCode,
          })
        }
      })
    } catch (e) {
      logger.error(`Could not translate ServiceRequest codings: \n ${e}`)
    }
    return sr
  }

  /**
   * TODO: Implement!
   * @param sr
   * @returns
   */
  static async translateLocations(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
    // logger.info('Not Implemented yet!')

    return sr
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async mapConcepts(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info('Mapping Concepts!')

    labBundle = await LabWorkflowsBw.addBwCodings(labBundle)

    let response: R4.IBundle = await saveBundle(labBundle)

    sendPayload({ bundle: labBundle }, topicList.MAP_LOCATIONS)

    return response
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async mapLocations(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info('Mapping Locations!')

    // labBundle = await LabWorkflowsBw.addBwLocations(labBundle)
    // let response: R4.IBundle = await saveLabBundle(labBundle)

    sendPayload({ bundle: labBundle }, topicList.SAVE_PIMS_PATIENT)
    sendPayload({ bundle: labBundle }, topicList.SEND_ADT_TO_IPMS)

    return labBundle
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async savePimsPatient(labBundle: R4.IBundle): Promise<R4.IBundle> {
    let resultBundle = this.updateCrPatient(labBundle)

    return resultBundle
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async saveIpmsPatient(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
    // Save to CR
    let resultBundle = this.updateCrPatient(registrationBundle)

    // Handle order entry
    this.handleAdtFromIpms(registrationBundle)

    return resultBundle
  }

  /**
   * updateCrPatient
   * @param labBundle
   * @returns
   */
  public static async updateCrPatient(bundle: R4.IBundle): Promise<R4.IBundle> {
    const crUrl = `${config.get('clientRegistryUrl')}/Patient`
    let pat: IPatient

    let patResult = bundle.entry!.find(entry => {
      return entry.resource && entry.resource.resourceType == 'Patient'
    })

    let options = {
      timeout: config.get('bwConfig:requestTimeout'),
      username: config.get('mediator:client:username'),
      password: config.get('mediator:client:password'),
      json: {},
    }

    if (patResult) {
      pat = <R4.IPatient>patResult.resource!
      options.json = pat
    }

    let crResult = await got.post(`${crUrl}`, options).json()

    logger.info(`CR Patient Update Result: ${crResult}`)

    return bundle
  }

  /**
   * IPMS Order Creation Workflow
   * @param val
   * @returns
   */
  public static async sendAdtToIpms(labBundle: R4.IBundle): Promise<R4.IBundle> {
    let status = this.getTaskStatus(labBundle)

    if (status && status === TaskStatusKind._requested) {
      logger.info('Sending ADT message to IPMS!')

      let sender = new Hl7MllpSender(
        config.get('bwConfig:mllp:targetIp'),
        config.get('bwConfig:mllp:targetAdtPort'),
      )

      let adtMessage = await Hl7WorkflowsBw.getFhirTranslation(
        labBundle,
        config.get('bwConfig:toIpmsAdtTemplate'),
      )

      logger.info(`adt:\n${adtMessage}`)

      let adtResult: String = <String>await sender.send(adtMessage)

      if (adtResult.includes('AA')) {
        labBundle = this.setTaskStatus(labBundle, R4.TaskStatusKind._accepted)
      }
      logger.info(`res:\n${adtResult}`)
    } else {
      logger.info('Order not ready for IPMS.')
    }
    return labBundle
  }

  public static async sendOrmToIpms(labBundle: R4.IBundle): Promise<R4.IBundle> {
    let ormMessage = await Hl7WorkflowsBw.getFhirTranslation(
      labBundle,
      config.get('bwConfig:toIpmsOrmTemplate'),
    )

    let sender = new Hl7MllpSender(
      config.get('bwConfig:mllp:targetIp'),
      config.get('bwConfig:mllp:targetOrmPort'),
    )

    logger.info('Sending ORM message to IPMS!')

    logger.info(`orm:\n${ormMessage}\n`)

    let result: any = await sender.send(ormMessage)

    if (result.includes('AA')) {
      labBundle = this.setTaskStatus(labBundle, R4.TaskStatusKind._inProgress)
    }
    logger.info(`*result:\n${result}\n`)

    return labBundle
  }

  public static async handleAdtFromIpms(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      let options = {
        timeout: config.get('bwConfig:requestTimeout'),
        searchParams: {},
      }

      let patient: IPatient, omang: String
      let patEntry = registrationBundle.entry!.find(entry => {
        return entry.resource && entry.resource.resourceType == 'Patient'
      })

      if (patEntry) {
        patient = <IPatient>patEntry

        let omangEntry = patient.identifier?.find(
          i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
        )

        if (omangEntry) {
          omang = omangEntry.value!
        } else {
          omang = ''
        }

        // Find all patients with this Omang.
        options.searchParams = {
          identifier: `${config.get('bwConfig:omangSystemUrl')}|${omang}`,
          _revinclude: 'Task:patient',
        }

        let patientTasks: IBundle
        try {
          patientTasks = await got
            .get(`${config.get('fhirServer:baseURL')}/Patient`, options)
            .json()
        } catch (e) {
          patientTasks = { resourceType: 'Bundle' }
          logger.error(e)
        }

        if (patientTasks && patientTasks.entry) {
          // Get all Tasks with `requested` status
          for (const e of patientTasks.entry!) {
            if (
              e.resource &&
              e.resource.resourceType == 'Task' &&
              e.resource.status == TaskStatusKind._requested
            ) {
              // Grab bundle for task:
              options.searchParams = {
                _include: '*',
                _id: e.resource.id,
              }

              let taskBundle: IBundle = await got
                .get(`${config.get('fhirServer:baseURL')}/Task`, options)
                .json()

              sendPayload(taskBundle, topicList.SEND_ORM_TO_IPMS)
            }
          }
        }
      }
    } catch (e) {
      logger.error(e)
    }

    // let obrMessage = await Hl7WorkflowsBw.getFhirTranslation(labBundle, 'OBR.hbs')

    // let obrResult = await sender.send(obrMessage)

    // logger.info(`obr:\n${obrMessage}\nres:\n${obrResult}`)

    // let response: R4.IBundle = await saveLabBundle(labBundle)

    return registrationBundle
  }

  private static getTaskStatus(labBundle: R4.IBundle): R4.TaskStatusKind | undefined {
    let taskResult, task

    try {
      taskResult = labBundle.entry!.find(entry => {
        return entry.resource && entry.resource.resourceType == 'Task'
      })

      if (taskResult) {
        task = <R4.ITask>taskResult.resource!

        return task.status!
      }
    } catch (error) {
      logger.error(`Could not get Task status for task:\n${task}`)
      return undefined
    }
  }

  private static setTaskStatus(labBundle: R4.IBundle, status: R4.TaskStatusKind): R4.IBundle {
    let taskIndex, task

    try {
      taskIndex = labBundle.entry!.findIndex(entry => {
        return entry.resource && entry.resource.resourceType == 'Task'
      })

      if (labBundle.entry && labBundle.entry.length > 0 && taskIndex >= 0) {
        ;(<R4.ITask>labBundle.entry[taskIndex].resource!).status = status
      }
      return labBundle
    } catch (error) {
      logger.error(`Could not get Task status for task:\n${task}`)
      return labBundle
    }
  }
}
