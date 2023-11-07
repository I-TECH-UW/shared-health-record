'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import {
  BundleTypeKind,
  Bundle_RequestMethodKind,
  IBundle,
  IBundle_Entry,
  IDiagnosticReport,
  IObservation,
  IPatient,
  IReference,
  IServiceRequest,
  TaskStatusKind,
} from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got'
import { saveBundle } from '../hapi/lab'
import config from '../lib/config'
import Hl7MllpSender from '../lib/hl7MllpSender'
import { KafkaProducerUtil } from '../lib/kafkaProducerUtil'
import logger from '../lib/winston'
import Hl7WorkflowsBw from './hl7WorkflowsBw'
import { LabWorkflows } from './labWorkflows'
import facilityMappings from '../lib/locationMap'
import crypto from 'crypto'
import { KafkaConfig, ProducerRecord } from 'kafkajs'
import { logLevel } from 'kafkajs'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hl7 = require('hl7')

const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

const producerConfig: KafkaConfig = {
  clientId: 'shr-producer',
  brokers: brokers,
  logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR,
}

export const topicList = {
  MAP_CONCEPTS: 'map-concepts',
  MAP_LOCATIONS: 'map-locations',
  SEND_ADT_TO_IPMS: 'send-adt-to-ipms',
  SEND_ORM_TO_IPMS: 'send-orm-to-ipms',
  SAVE_PIMS_PATIENT: 'save-pims-patient',
  SAVE_IPMS_PATIENT: 'save-ipms-patient',
  HANDLE_ORU_FROM_IPMS: 'handle-oru-from-ipms',
}

export class LabWorkflowsBw extends LabWorkflows {
  private static kafka = new KafkaProducerUtil(producerConfig, report => {
    logger.info('Delivery report:', report)
  })

  // Static instance of the Kafka producer.
  private static kafkaProducerInitialized = false

  // Initialize Kafka producer when the class is first used.
  public static async initKafkaProducer() {
    if (!this.kafkaProducerInitialized) {
      await this.kafka.init()
      this.kafkaProducerInitialized = true
    }
  }

  // Shutdown Kafka producer when the application terminates.
  public static async shutdownKafkaProducer() {
    if (this.kafkaProducerInitialized) {
      await this.kafka.shutdown()
      this.kafkaProducerInitialized = false
    }
  }

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
      await this.sendPayload(
        { bundle: orderBundle, response: resultBundle },
        topicList.MAP_CONCEPTS,
      )
    } catch (e) {
      logger.error(e)
    }
  }

  static async executeTopicWorkflow(topic: string, val: any) {
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
          res = await LabWorkflowsBw.sendOrmToIpms(JSON.parse(val))
          break
        case topicList.HANDLE_ORU_FROM_IPMS:
          res = await LabWorkflowsBw.handleOruFromIpms(JSON.parse(val).bundle)
          break
        default:
          break
      }
      await new Promise(resolve => setTimeout(resolve, 300))

      return res
    } catch (e) {
      logger.error(e)
    }
  }

  // Add coding mappings info to bundle
  static async addBwCodings(bundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      for (const e of bundle.entry!) {
        if (
          e.resource &&
          e.resource.resourceType == 'ServiceRequest' &&
          e.resource.code &&
          e.resource.code.coding &&
          e.resource.code.coding.length > 0
        ) {
          logger.info`Translating ServiceRequest Codings`
          e.resource = await this.translateCoding(e.resource)
        }
      }
    } catch (e) {
      logger.error(e)
    }

    return bundle
  }

  /**
   * This method adds IPMS-specific location mappings to the order bundle based on the ordering
   * facility
   * @param bundle
   * @returns bundle
   */
  //
  //
  // This method assumes that the Task resource has a reference to the recieving facility
  // under the `owner` field. This is the facility that the lab order is being sent to.
  static async addBwLocations(bundle: R4.IBundle): Promise<R4.IBundle> {
    let mappedLocation: R4.ILocation | undefined
    let mappedOrganization: R4.IOrganization | undefined

    try {
      logger.info('Adding Location Info to Bundle')

      if (bundle && bundle.entry) {
        const task: R4.ITask = <R4.ITask>this.getBundleEntry(bundle.entry, 'Task')
        const srs: R4.IServiceRequest[] = <R4.IServiceRequest[]>(
          this.getBundleEntries(bundle.entry, 'ServiceRequest')
        )

        const orderingLocationRef: R4.IReference | undefined = task.location

        const srOrganizationRefs: (R4.IReference | undefined)[] = srs.map(sr => {
          if (sr.requester) {
            return sr.requester
          } else {
            return undefined
          }
        })

        const locationId = orderingLocationRef?.reference?.split('/')[1]
        const srOrgIds = srOrganizationRefs.map(ref => {
          return ref?.reference?.split('/')[1]
        })

        const uniqueOrgIds = Array.from(new Set(srOrgIds))

        if (uniqueOrgIds.length != 1 || !locationId) {
          logger.error(
            `Wrong number of ordering Organizations and Locations in this bundle:\n${JSON.stringify(
              uniqueOrgIds,
            )}\n${JSON.stringify(locationId)}`,
          )
        }

        let orderingLocation = <R4.ILocation>(
          this.getBundleEntry(bundle.entry, 'Location', locationId)
        )
        let orderingOrganization = <R4.IOrganization>(
          this.getBundleEntry(bundle.entry, 'Organization', uniqueOrgIds[0])
        )

        if (!orderingLocation) {
          logger.error('Could not find ordering Location! Using Omrs Location instead.')
          orderingLocation = <R4.ILocation>this.getBundleEntry(bundle.entry, 'Location')
        }

        if (orderingLocation) {
          if (!orderingOrganization) {
            logger.error('No ordering Organization found - copying location info!')
            orderingOrganization = {
              resourceType: 'Organization',
              id: crypto
                .createHash('md5')
                .update('Organization/' + orderingLocation.name)
                .digest('hex'),
              identifier: orderingLocation.identifier,
              name: orderingLocation.name,
            }
          } else if (
            !orderingLocation.managingOrganization ||
            orderingLocation.managingOrganization.reference?.split('/')[1] !=
              orderingOrganization.id
          ) {
            logger.error('Ordering Organization is not the managing Organziation of Location!')
          }

          mappedLocation = await this.translateLocation(orderingLocation)
          mappedOrganization = {
            resourceType: 'Organization',
            id: crypto
              .createHash('md5')
              .update('Organization/' + mappedLocation.name)
              .digest('hex'),
            identifier: mappedLocation.identifier,
            name: mappedLocation.name,
          }

          const mappedLocationRef: R4.IReference = {
            reference: `Location/${mappedLocation.id}`,
          }
          const mappedOrganizationRef: R4.IReference = {
            reference: `Organization/${mappedOrganization.id}`,
          }

          mappedLocation.managingOrganization = mappedOrganizationRef

          if (mappedLocation && mappedLocation.id) {
            task.location = mappedLocationRef

            bundle.entry.push({
              resource: mappedLocation,
              request: {
                method: R4.Bundle_RequestMethodKind._put,
                url: mappedLocationRef.reference,
              },
            })
          }
          if (mappedOrganization && mappedOrganization.id) {
            task.owner = mappedOrganizationRef
            bundle.entry.push({
              resource: mappedOrganization,
              request: {
                method: R4.Bundle_RequestMethodKind._put,
                url: mappedOrganizationRef.reference,
              },
            })
            for (const sr of srs) {
              sr.performer
                ? sr.performer.push(mappedOrganizationRef)
                : (sr.performer = [mappedOrganizationRef])
            }
          }
        }
      }
    } catch (e) {
      logger.error(e)
    }

    return bundle
  }

  private static getBundleEntry(
    entries: IBundle_Entry[],
    type: string,
    id?: string,
  ): R4.IResource | undefined {
    const entry = entries.find(entry => {
      return (
        entry.resource && entry.resource.resourceType == type && (!id || entry.resource.id == id)
      )
    })

    return entry?.resource
  }

  private static getBundleEntries(
    entries: IBundle_Entry[],
    type: string,
    id?: string,
  ): (R4.IResource | undefined)[] {
    return entries
      .filter(entry => {
        return (
          entry.resource && entry.resource.resourceType == type && (!id || entry.resource.id == id)
        )
      })
      .map(entry => {
        return entry.resource
      })
  }

  static async translateCoding(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
    let ipmsCoding, cielCoding, loincCoding, pimsCoding

    try {
      if (sr && sr.code && sr.code.coding && sr.code.coding.length > 0) {
        pimsCoding = this.getCoding(sr, config.get('bwConfig:pimsSystemUrl'))
        cielCoding = this.getCoding(sr, config.get('bwConfig:cielSystemUrl'))

        logger.info(`PIMS Coding: ${JSON.stringify(pimsCoding)}`)
        logger.info(`CIEL Coding: ${JSON.stringify(cielCoding)}`)

        if (pimsCoding && pimsCoding.code) {
          // Translate from PIMS to CIEL and IPMS
          ipmsCoding = await this.getIpmsCode(
            `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${pimsCoding.code}&toConceptSource=PIMSLAB`,
            pimsCoding.code,
          )

          if (ipmsCoding && ipmsCoding.code) {
            cielCoding = await this.getMappedCode(
              `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCoding.code}`,
            )
          }

          if (cielCoding && cielCoding.code) {
            sr.code.coding.push({
              system: config.get('bwConfig:cielSystemUrl'),
              code: cielCoding.code,
              display: cielCoding.display,
            })
          }
        } else if (cielCoding && cielCoding.code) {
          // Translate from CIEL to IPMS
          ipmsCoding = await this.getIpmsCode(
            `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${cielCoding.code}&toConceptSource=CIEL`,
            cielCoding.code,
          )
        }

        // Add IPMS Coding
        if (ipmsCoding && ipmsCoding.code) {
          const ipmsOrderTypeExt = {
            url: config.get('bwConfig:ipmsOrderTypeSystemUrl'),
            valueString: ipmsCoding.hl7Flag,
          }

          const srCoding = {
            system: config.get('bwConfig:ipmsSystemUrl'),
            code: ipmsCoding.mnemonic,
            display: ipmsCoding.display,
            extension: [ipmsOrderTypeExt],
          }

          sr.code.coding.push(srCoding)
        }

        // Get LOINC Coding
        if (cielCoding && cielCoding.code) {
          loincCoding = await this.getMappedCode(
            `/orgs/CIEL/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCoding.code}`,
          )
          if (loincCoding && loincCoding.code) {
            sr.code.coding.push({
              system: config.get('bwConfig:loincSystemUrl'),
              code: loincCoding.code,
              display: loincCoding.display,
            })
          }
        }

        return sr
      } else {
        logger.error('Could not find coding to translate in:\n' + JSON.stringify(sr))
        return sr
      }
    } catch (e) {
      logger.error(`Could not translate ServiceRequest codings: \n ${e}`)
      return sr
    }
  }

  /**
   * @param location
   * @returns R4.ILocation
   */
  static async translateLocation(location: R4.ILocation): Promise<R4.ILocation> {
    logger.info('Translating Location Data')

    const returnLocation: R4.ILocation = {
      resourceType: 'Location',
    }
    const mappings = await facilityMappings
    let targetMapping
    logger.info('Facility mappings: ' + mappings.length)

    for (const mapping of mappings) {
      if (mapping.orderingFacility == location.name) {
        targetMapping = mapping
      }
    }

    if (targetMapping) {
      logger.info(
        "Mapped location '" + location.name + "' to '" + targetMapping.orderingFacility + "'",
      )
      returnLocation.id = crypto
        .createHash('md5')
        .update('Organization/' + returnLocation.name)
        .digest('hex')
      returnLocation.identifier = [
        {
          system: config.get('bwConfig:ipmsCodeSystemUrl'),
          value: targetMapping.receivingFacility,
        },
      ]

      returnLocation.name = targetMapping.receivingFacility
      returnLocation.extension = []
      returnLocation.extension.push({
        url: config.get('bwConfig:ipmsProviderSystemUrl'),
        valueString: targetMapping.provider,
      })
      returnLocation.extension.push({
        url: config.get('bwConfig:ipmsPatientTypeSystemUrl'),
        valueString: targetMapping.patientType,
      })
      returnLocation.extension.push({
        url: config.get('bwConfig:ipmsPatientStatusSystemUrl'),
        valueString: targetMapping.patientStatus,
      })
      returnLocation.extension.push({
        url: config.get('bwConfig:ipmsXLocationSystemUrl'),
        valueString: targetMapping.xLocation,
      })
    } else {
      logger.error('Could not find a location mapping for:\n' + JSON.stringify(location.name))
    }

    logger.info(`Translated Location:\n${JSON.stringify(returnLocation)}`)
    return returnLocation
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async mapConcepts(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info('Mapping Concepts!')

    labBundle = await LabWorkflowsBw.addBwCodings(labBundle)

    const response: R4.IBundle = await saveBundle(labBundle)

    await this.sendPayload({ bundle: labBundle }, topicList.MAP_LOCATIONS)

    return response
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async mapLocations(labBundle: R4.IBundle): Promise<R4.IBundle> {
    logger.info('Mapping Locations!')

    labBundle = await LabWorkflowsBw.addBwLocations(labBundle)
    const response: R4.IBundle = await saveBundle(labBundle)

    await this.sendPayload({ bundle: labBundle }, topicList.SAVE_PIMS_PATIENT)
    await this.sendPayload({ bundle: labBundle }, topicList.SEND_ADT_TO_IPMS)

    logger.debug(`Response: ${JSON.stringify(response)}`)
    return response
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async savePimsPatient(labBundle: R4.IBundle): Promise<R4.IBundle> {
    const resultBundle = this.updateCrPatient(labBundle)

    return resultBundle
  }

  /**
   *
   * @param labBundle
   * @returns
   */
  public static async saveIpmsPatient(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
    // Save to CR
    const resultBundle = this.updateCrPatient(registrationBundle)

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

    const patResult = bundle.entry!.find(entry => {
      return entry.resource && entry.resource.resourceType == 'Patient'
    })

    const options = {
      timeout: config.get('bwConfig:requestTimeout'),
      username: config.get('mediator:client:username'),
      password: config.get('mediator:client:password'),
      json: {},
    }

    if (patResult) {
      pat = <R4.IPatient>patResult.resource!
      options.json = pat
    }

    const crResult = await got.post(`${crUrl}`, options).json()

    logger.debug(`CR Patient Update Result: ${JSON.stringify(crResult)}`)

    return bundle
  }

  /**
   * IPMS Order Creation Workflow
   * @param val
   * @returns
   */
  public static async sendAdtToIpms(labBundle: R4.IBundle): Promise<R4.IBundle> {
    const status = this.getTaskStatus(labBundle)

    if (status && status === TaskStatusKind._requested) {
      logger.info('Sending ADT message to IPMS!')

      const sender = new Hl7MllpSender(
        config.get('bwConfig:mllp:targetIp'),
        config.get('bwConfig:mllp:targetAdtPort'),
      )

      const adtMessage = await Hl7WorkflowsBw.getFhirTranslation(
        labBundle,
        config.get('bwConfig:toIpmsAdtTemplate'),
      )

      logger.info(`adt:\n${adtMessage}`)

      const adtResult: string = <string>await sender.send(adtMessage)

      if (adtResult.includes && adtResult.includes('AA')) {
        labBundle = this.setTaskStatus(labBundle, R4.TaskStatusKind._accepted)
      }
    } else {
      logger.info('Order not ready for IPMS.')
    }
    return labBundle
  }

  public static async sendOrmToIpms(bundles: any): Promise<R4.IBundle> {
    const srBundle: IBundle = { resourceType: 'Bundle', entry: [] }
    let labBundle = bundles.taskBundle
    const patient = bundles.patient

    // logger.info(`task bundle:\n${JSON.stringify(bundles.taskBundle)}\npatient:\n${JSON.stringify(bundles.patient)}`)

    try {
      // Replace PIMS/OpenMRS Patient Resource with one From IPMS Lab System
      const pindex = labBundle.entry!.findIndex((entry: any) => {
        return entry.resource && entry.resource.resourceType == 'Patient'
      })

      labBundle.entry[pindex].resource = patient

      const options = {
        timeout: config.get('bwConfig:requestTimeout'),
        searchParams: {},
      }

      const sendBundle = { ...labBundle }
      sendBundle.entry = []
      srBundle.entry = []

      // Compile sendBundle.entry from labBundle
      // TODO: Outline Logic for mapping between Panels and sending multiple tests
      for (const entry of labBundle.entry) {
        // Isolate and process ServiceRequests
        if (entry.resource && entry.resource.resourceType == 'ServiceRequest') {
          // For PIMS - check if service request is profile-level and get child service requests:
          options.searchParams = {
            'based-on': entry.resource.id,
          }

          const fetchedBundle = <R4.IBundle>(
            await got.get(`${config.get('fhirServer:baseURL')}/ServiceRequest`, options).json()
          )

          if (fetchedBundle && fetchedBundle.entry && srBundle.entry) {
            // Add child ServiceRequests if any exist
            srBundle.entry = srBundle.entry.concat(fetchedBundle.entry)
          } else if (
            (!fetchedBundle || !(fetchedBundle.entry && fetchedBundle.entry.length > 0)) &&
            srBundle.entry
          ) {
            // If no child ServiceRequests, add this one if it has a code entry
            if (
              entry.resource.code &&
              entry.resource.code.coding &&
              entry.resource.code.coding.length > 0
            ) {
              srBundle.entry.push(entry)
            }
          }
        } else {
          // Copy over everything else
          sendBundle.entry.push(entry)
        }
      }

      // Send one ORM for each ServiceRequest
      // TODO: FIGURE OUT MANAGEMENT OF PANELS/PROFILES
      for (const sr of srBundle.entry) {
        // Send one ORM for each ServiceRequest
        const outBundle = { ...sendBundle }
        outBundle.entry.push(sr)

        const ormMessage = await Hl7WorkflowsBw.getFhirTranslation(
          outBundle,
          config.get('bwConfig:toIpmsOrmTemplate'),
        )

        const sender = new Hl7MllpSender(
          config.get('bwConfig:mllp:targetIp'),
          config.get('bwConfig:mllp:targetOrmPort'),
        )

        logger.info('Sending ORM message to IPMS!')

        logger.info(`orm:\n${ormMessage}\n`)

        if (ormMessage && ormMessage != '') {
          const result: any = await sender.send(ormMessage)
          if (result.includes('AA')) {
            labBundle = this.setTaskStatus(labBundle, R4.TaskStatusKind._inProgress)
          }
          logger.info(`*result:\n${result}\n`)
        }
      }
    } catch (e) {
      logger.error(e)
    }
    return labBundle
  }

  public static async handleAdtFromIpms(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
    try {
      const options = {
        timeout: config.get('bwConfig:requestTimeout'),
        searchParams: {},
      }

      let patient: IPatient, omang: string
      const patEntry = registrationBundle.entry!.find(entry => {
        return entry.resource && entry.resource.resourceType == 'Patient'
      })

      if (patEntry && patEntry.resource) {
        patient = <IPatient>patEntry.resource

        const omangEntry = patient.identifier?.find(
          i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
        )

        if (omangEntry) {
          omang = omangEntry.value!
        } else {
          logger.error(
            'Missing Omang - currently, only matching on Omang supported, but patient does not have an Omang number.',
          )
          return registrationBundle
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

              const taskBundle: IBundle = await got
                .get(`${config.get('fhirServer:baseURL')}/Task`, options)
                .json()

              await this.sendPayload(
                { taskBundle: taskBundle, patient: patient },
                topicList.SEND_ORM_TO_IPMS,
              )
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

  public static async handleOruFromIpms(translatedBundle: R4.IBundle): Promise<R4.IBundle> {
    // Get Patient By Omang

    // Get ServiceRequests by status and code

    // Match Results to Service Requests
    try {
      if (translatedBundle && translatedBundle.entry) {
        const patient: IPatient = <IPatient>(
          translatedBundle.entry.find(e => e.resource && e.resource.resourceType == 'Patient')!
            .resource!
        )

        const dr: IDiagnosticReport = <IDiagnosticReport>(
          translatedBundle.entry.find(
            e => e.resource && e.resource.resourceType == 'DiagnosticReport',
          )!.resource!
        )

        const obs: IObservation = <IObservation>(
          translatedBundle.entry.find(e => e.resource && e.resource.resourceType == 'Observation')!
            .resource!
        )
        const drCode =
          dr.code && dr.code.coding && dr.code.coding.length > 0 ? dr.code.coding[0].code : ''

        let omang
        const omangEntry = patient.identifier?.find(
          i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
        )

        if (omangEntry) {
          omang = omangEntry.value!
        } else {
          omang = ''
        }

        const options = {
          timeout: config.get('bwConfig:requestTimeout'),
          searchParams: {},
        }

        // Find all active service requests with dr code with this Omang.
        options.searchParams = {
          identifier: `${config.get('bwConfig:omangSystemUrl')}|${omang}`,
          _revinclude: ['ServiceRequest:patient', 'Task:patient'],
        }

        const patientBundle = <R4.IBundle>(
          await got
            .get(
              `${config.get('fhirServer:baseURL')}/Patient/identifier=${config.get(
                'bwConfig:omangSystemUrl',
              )}|${omang}&_revinclude=Task:patient&_revinclude=ServiceRequest:patient`,
            )
            .json()
        )

        if (patientBundle && patientBundle.entry && patientBundle.entry.length > 0) {
          const candidates: IServiceRequest[] = patientBundle.entry
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

          const primaryCandidate: IServiceRequest | undefined = candidates.find(c => {
            if (c && c.code && c.code.coding) {
              const candidateCode = c.code.coding.find(
                co => co.system == config.get('bwConfig:ipmsSystemUrl'),
              )
              return candidateCode && candidateCode.code == drCode
            }
            return false
          })

          // Update DR based on primary candidate details
          // Update Obs based on primary candidate details
          if (primaryCandidate && primaryCandidate.code && primaryCandidate.code.coding) {
            if (dr.code && dr.code.coding)
              dr.code.coding = dr.code.coding.concat(primaryCandidate.code.coding)
            if (obs.code && obs.code.coding)
              obs.code.coding = obs.code.coding.concat(primaryCandidate.code.coding)

            const srRef: IReference = {}
            srRef.type = 'ServiceRequest'
            srRef.reference = 'ServiceRequest/' + primaryCandidate.id

            dr.basedOn = [srRef]
            obs.basedOn = [srRef]
          }
        }

        // TODO: Only send if valid details available
        const sendBundle: R4.IBundle = {
          resourceType: 'Bundle',
          type: BundleTypeKind._transaction,
          entry: [
            {
              resource: patient,
              request: { method: Bundle_RequestMethodKind._put, url: 'Patient/' + patient.id },
            },
            {
              resource: dr,
              request: { method: Bundle_RequestMethodKind._put, url: 'DiagnosticReport/' + dr.id },
            },
            {
              resource: obs,
              request: { method: Bundle_RequestMethodKind._put, url: 'Observation/' + obs.id },
            },
          ],
        }

        // Save to SHR
        const resultBundle: R4.IBundle = await saveBundle(sendBundle)
        return resultBundle
      }
    } catch (error) {
      logger.error(`Could not process ORU!\n${error}`)
    }

    return translatedBundle
  }

  public static getTaskStatus(labBundle: R4.IBundle): R4.TaskStatusKind | undefined {
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

  public static setTaskStatus(labBundle: R4.IBundle, status: R4.TaskStatusKind): R4.IBundle {
    let taskIndex, task

    try {
      taskIndex = labBundle.entry!.findIndex(entry => {
        return entry.resource && entry.resource.resourceType == 'Task'
      })

      if (labBundle.entry && labBundle.entry.length > 0 && taskIndex >= 0) {
        (<R4.ITask>labBundle.entry[taskIndex].resource!).status = status
      }
      return labBundle
    } catch (error) {
      logger.error(`Could not get Task status for task:\n${task}`)
      return labBundle
    }
  }

  private static getCoding(sr: R4.IServiceRequest, system: string): R4.ICoding {
    if (sr.code && sr.code.coding) {
      return <R4.ICoding>sr.code.coding.find(e => e.system && e.system == system)
    } else {
      return {}
    }
  }

  /**
   * Sends a payload to a Kafka topic.
   * @param payload - The payload to send.
   * @param topic - The Kafka topic to send the payload to.
   * @returns A Promise that resolves when the payload has been sent.
   */
  public static async sendPayload(payload: any, topic: string) {
    await this.initKafkaProducer()

    const records: ProducerRecord[] = [
      {
        topic: topic,
        messages: [{ key: 'body', value: JSON.stringify(payload) }],
      },
    ]

    try {
      logger.info(`Sending payload to topic ${topic}: ${JSON.stringify(payload)}`)
      await this.kafka.sendMessageTransactionally(records)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  private static async getIpmsCode(q: string, c = '') {
    try {
      const ipmsMappings = await this.getOclMapping(q)

      //logger.info(`IPMS Mappings: ${JSON.stringify(ipmsMappings)}`)

      // Prioritize "Broader Than Mappings"
      //TODO: Figure out if this is proper way to handle panels / broad to narrow
      let mappingIndex = ipmsMappings.findIndex(
        (x: any) => x.map_type == 'BROADER-THAN' && x.to_concept_code == c,
      )

      // Fall back to "SAME AS"
      if (mappingIndex < 0) {
        mappingIndex = ipmsMappings.findIndex(
          (x: any) => x.map_type == 'SAME-AS' && x.to_concept_code == c,
        )
      }

      if (mappingIndex >= 0) {
        const ipmsCode = ipmsMappings[mappingIndex].from_concept_code
        const ipmsDisplay = ipmsMappings[mappingIndex].from_concept_name_resolved
        const ipmsCodingInfo: any = await this.getOclMapping(
          `/orgs/I-TECH-UW/sources/IPMSLAB/concepts/${ipmsCode}`,
        )
        // logger.info(`IPMS Coding Info: ${JSON.stringify(ipmsCodingInfo)}`)
        let ipmsMnemonic, hl7Flag
        if (ipmsCodingInfo) {
          ipmsMnemonic = ipmsCodingInfo.names.find((x: any) => x.name_type == 'Short').name
          hl7Flag =
            ipmsCodingInfo.extras && ipmsCodingInfo.extras.IPMS_HL7_ORM_TYPE
              ? ipmsCodingInfo.extras.IPMS_HL7_ORM_TYPE
              : 'LAB'
        }

        return { code: ipmsCode, display: ipmsDisplay, mnemonic: ipmsMnemonic, hl7Flag: hl7Flag }
      } else {
        return null
      }
    } catch (e) {
      logger.error(e)
      return null
    }
  }

  private static async getMappedCode(q: string): Promise<any> {
    try {
      const codeMapping = await this.getOclMapping(q)

      //logger.info(`Code Mapping: ${JSON.stringify(codeMapping)}`)

      if (codeMapping && codeMapping.length > 0) {
        return {
          code: codeMapping[0].to_concept_code,
          display: codeMapping[0].to_concept_name_resolved,
        }
      } else {
        return {}
      }
    } catch (e) {
      logger.error(e)
      return {}
    }
  }

  private static async getOclMapping(queryString: string): Promise<any[]> {
    const options = { timeout: config.get('bwConfig:requestTimeout') | 1000 }

    logger.info(`${config.get('bwConfig:oclUrl')}${queryString}`)

    return got.get(`${config.get('bwConfig:oclUrl')}${queryString}`, options).json()
  }

  private static async getOclConcept(conceptCode: string): Promise<any> {
    const options = { timeout: config.get('bwConfig:requestTimeout') | 1000 }

    return got
      .get(
        `${config.get('bwConfig:oclUrl')}/orgs/I-TECH-UW/sources/IPMSLAB/concepts/${conceptCode}`,
        options,
      )
      .json()
  }
}
