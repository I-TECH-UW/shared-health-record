import { R4 } from '@ahryman40k/ts-fhir-types'
import config from '../../lib/config'
import logger from '../../lib/winston'
import { getTaskStatus, setTaskStatus } from './helpers'
import { hl7Sender } from '../../lib/hl7MllpSender'
import Hl7WorkflowsBw from '../botswana/hl7Workflows'
import got from 'got'
import { translateCoding } from './terminologyWorkflows'
import {
  BundleTypeKind,
  Bundle_RequestMethodKind,
  IBundle,
  IDiagnosticReport,
  IObservation,
  IPatient,
  ITask,
  TaskStatusKind,
} from '@ahryman40k/ts-fhir-types/lib/R4'
import { saveBundle } from '../../hapi/lab'
import { hapiGet } from '../../lib/helpers'

// New Error Type for IPMS Workflow Errors
export class IpmsWorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IpmsWorkflowError'
  }
}

export class IpmsErrorBundle {
  message: string
  bundle: R4.IBundle
  operationOutcome: R4.IOperationOutcome
  constructor(message: string) {
    this.message = message
    this.operationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: R4.OperationOutcome_IssueSeverityKind._error,
          code: R4.OperationOutcome_IssueCodeKind._notFound,
          details: {
            text: message,
          }
        },
      ],
    }
    this.bundle = {
      resourceType: 'Bundle',
      type: BundleTypeKind._transactionResponse,
      entry: [
        {
          response: {
            status: '500 Server Error',
            outcome: this.operationOutcome,
          },
        },
      ],
    
    }
  }
}

/**
 * Sends an ADT message to IPMS.
 * @param labBundle The lab bundle to send.
 * @returns The updated lab bundle.
 */
export async function sendAdtToIpms(labBundle: R4.IBundle): Promise<R4.IBundle> {
  const status = getTaskStatus(labBundle)

  if (status && status === R4.TaskStatusKind._requested) {
    logger.info('Sending ADT message to IPMS!')

    const adtMessage = await Hl7WorkflowsBw.getFhirTranslationWithRetry(
      labBundle,
      config.get('bwConfig:toIpmsAdtTemplate'),
    )

    logger.info(`adt:\n${adtMessage}`)

    const targetIp = config.get('bwConfig:mllp:targetIp')
    const targetPort = config.get('bwConfig:mllp:targetAdtPort')

    const adtResult: string = <string>await hl7Sender.send(adtMessage, targetIp, targetPort)

    if (adtResult.includes && adtResult.includes('AA')) {
      labBundle = setTaskStatus(labBundle, R4.TaskStatusKind._received)
    }
  } else {
    logger.info('Order not ready for IPMS.')
  }
  return labBundle
}

export async function sendOrmToIpms(bundles: any): Promise<R4.IBundle> {
  const srBundle: R4.IBundle = { resourceType: 'Bundle', entry: [] }
  let labBundle = bundles.taskBundle
  const patient = bundles.patient

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

        const fetchedBundle = <
          R4.IBundle // TODO: Retry logic
          >await got.get(`${config.get('fhirServer:baseURL')}/ServiceRequest`, options).json()

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

      const ormMessage = await Hl7WorkflowsBw.getFhirTranslationWithRetry(
        outBundle,
        config.get('bwConfig:toIpmsOrmTemplate'),
      )

      const targetIp = config.get('bwConfig:mllp:targetIp')
      const targetPort = config.get('bwConfig:mllp:targetOrmPort')

      logger.info('Sending ORM message to IPMS!')

      logger.info(`orm:\n${ormMessage}\n`)

      if (ormMessage && ormMessage != '') {
        const result: any = await hl7Sender.send(ormMessage, targetIp, targetPort)
        if (result.includes('AA')) {
          labBundle = setTaskStatus(labBundle, R4.TaskStatusKind._accepted)
        }
        logger.info(`*result:\n${result}\n`)
      }
    }
  } catch (e) {
    logger.error(`Could not send ORM message to IPMS!\n${e}`)
    throw new IpmsWorkflowError(`Could not send ORM message to IPMS!\n${e}`)
  }
  return labBundle
}

/**
 * Handles ADT (Admission, Discharge, Transfer) messages received from IPMS (Integrated Patient Management System).
 *
 * This method needs to be able to match the patient coming back to the patient going in.
 *
 * @param registrationBundle - The registration bundle containing the patient information.
 * @returns A Promise that resolves to the registration bundle.
 */
export async function handleAdtFromIpms(adtMessage: string): Promise<any> {
  try {
    const registrationBundle: R4.IBundle = await Hl7WorkflowsBw.translateBundle(
      adtMessage,
      'bwConfig:fromIpmsAdtTemplate',
    )

    if (registrationBundle === Hl7WorkflowsBw.errorBundle) {
      throw new Error('Could not translate ADT message!')
    }

    const options = {
      timeout: config.get('bwConfig:requestTimeout'),
      searchParams: {},
    }

    // Get patient from registration Bundle
    let patient: R4.IPatient, omang: string, ppn: string, bcn: string, identifierParam: string

    const patEntry = registrationBundle.entry!.find(entry => {
      return entry.resource && entry.resource.resourceType == 'Patient'
    })

    if (patEntry && patEntry.resource) {
      patient = <R4.IPatient>patEntry.resource

      // Find patient identifiers, if they exist
      const omangEntry = patient.identifier?.find(
        i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
      )

      const ppnEntry = patient.identifier?.find(
        i => i.system && i.system == config.get('bwConfig:immigrationSystemUrl'),
      )

      const bcnEntry = patient.identifier?.find(
        i => i.system && i.system == config.get('bwConfig:bdrsSystemUrl'),
      )

      if (omangEntry && omangEntry.value) {
        omang = omangEntry.value
        identifierParam = `${config.get('bwConfig:omangSystemUrl')}|${omang}`
      } else if (bcnEntry && bcnEntry.value) {
        bcn = bcnEntry.value
        identifierParam = `${config.get('bwConfig:bdrsSystemUrl')}|${bcn}`
      } else if (ppnEntry && ppnEntry.value) {
        ppn = ppnEntry.value
        identifierParam = `${config.get('bwConfig:immigrationSystemUrl')}|${ppn}`
      } else {
        const errorMessage =
          'Patient missing a required identifier - matching supported only on Omang, birth certificate number, or passport number.'

        logger.error(errorMessage)

        throw new IpmsWorkflowError(errorMessage)
      }

      // Find all patients with these identifiers and grab the related Tasks
      options.searchParams = {
        identifier: `${identifierParam}`,
        _revinclude: 'Task:patient',
      }

      let potentialPatientTasks: R4.IBundle
      try {
        potentialPatientTasks = await got
          .get(`${config.get('fhirServer:baseURL')}/Patient`, options)
          .json()
      } catch (e) {
        potentialPatientTasks = { resourceType: 'Bundle' }
        logger.error(e)
      }

      if (potentialPatientTasks && potentialPatientTasks.entry) {
        // Get all Tasks with `received` status, which indicates the patient ADT has been sent to IPMS

        // Filter and Sort all resources in entry to have tasks by decending order or creation
        const patientTasks = potentialPatientTasks.entry
          .filter(
            e =>
              e.resource &&
              e.resource.resourceType == 'Task' &&
              e.resource.status == TaskStatusKind._received,
          )
          .sort((a, b) => {
            if (a.resource && b.resource) {
              const at = <ITask>a.resource
              const bt = <ITask>b.resource

              return new Date(bt.authoredOn || 0).getTime() - new Date(at.authoredOn || 0).getTime()
            }
            return 0
          })

        // TODO: Account for multiple task results!

        // For now, if multiple tasks exist, grab the most recent one and log a warning
        if (patientTasks.length > 1) {
          logger.warn(
            `More than one task found for patient ${patient.id} with identifier ${identifierParam}! Processing most recent.`,
          )
        }

        if (patientTasks.length > 0) {
          const targetTask = patientTasks[0].resource

          if (targetTask) {
            // Grab bundle for task:
            options.searchParams = {
              _include: '*',
              _id: targetTask.id,
            }

            const taskBundle: IBundle = await got
              .get(`${config.get('fhirServer:baseURL')}/Task`, options)
              .json()
            return { patient: patient, taskBundle: taskBundle }
          }
        }
        return { patient: undefined, taskBundle: undefined }
      } else {
        logger.error(
          'Could not find any patient tasks for patient with identifier ' + identifierParam + '!',
        )
        return { patient: undefined, taskBundle: undefined }
      }
    }
  } catch (e) {
    logger.error('Could not process ADT!\n' + e)
    throw new IpmsWorkflowError('Could not process ADT!\n' + e)
  }
}

/**
 * Handles ORU (Observation Result) messages received from IPMS (Integrated Patient Management System).
 */
export async function handleOruFromIpms(message: any): Promise<R4.IBundle> {
  let translatedBundle: R4.IBundle = { resourceType: 'Bundle' }
  let resultBundle: R4.IBundle = { resourceType: 'Bundle' }
  let serviceRequestBundle: R4.IBundle = { resourceType: 'Bundle' }

  let taskPatient, task

  try {
    if (!message)
      throw new Error('No message provided!')

    if (!message.bundle)
      message = JSON.parse(message)

    translatedBundle = message.bundle

    if (translatedBundle && translatedBundle.entry) {

      // Extract Patient, DiagnosticReport, and Observation
      const patient: IPatient = <IPatient>(
        translatedBundle.entry.find((e: any) => e.resource && e.resource.resourceType == 'Patient')!
          .resource!
      )

      let dr: IDiagnosticReport = <IDiagnosticReport>(
        translatedBundle.entry.find((e: any) => e.resource && e.resource.resourceType == 'DiagnosticReport')!.resource!
      )

      const obs: IObservation = <IObservation>(
        translatedBundle.entry.find((e: any) => e.resource && e.resource.resourceType == 'Observation')!
          .resource!
      )

      // Enrich DiagnosticReport with Terminology Mappings
      dr = <R4.IDiagnosticReport> (await  translateCoding(dr))

      // Process Patient information
      const { omang, bcn, ppn, patOptions } = processIpmsPatient(patient)

      /** Matching Approach:
       *  Use provided Lab Order Identifier to link ServiceRequest, Task, and Diagnostic Report together. 
      */

      // Extract Lab Order ID from Diagnostic Report
      const labOrderId = dr.identifier && dr.identifier.length > 0 ? dr.identifier.find((i: any) => i.system == config.get('bwConfig:labOrderSystemUrl')) : undefined
      const labOrderMrn = dr.identifier && dr.identifier.length > 0 ? dr.identifier.find((i: any) => i.system == config.get('bwConfig:mrnSystemUrl')) : undefined
      
      if(labOrderId && labOrderId.value) {
        const options = {
          timeout: config.get('bwConfig:requestTimeout'),
          searchParams: new URLSearchParams(),
        }     

        options.searchParams.append('_include','Task:patient')
        options.searchParams.append('_include','Task:based-on')
        options.searchParams.append('based-on',labOrderId.value)
        
        serviceRequestBundle = <R4.IBundle> (await hapiGet('Task', options))
      }

      if(serviceRequestBundle && serviceRequestBundle.entry && serviceRequestBundle.entry.length > 0) {  
        
        // Extract Task and Patient Resources from ServiceRequest Bundle
        taskPatient = <IPatient>(
          serviceRequestBundle.entry.find((e: any) => e.resource && e.resource.resourceType == 'Patient')!
            .resource!
        )

        task = <ITask>(
          serviceRequestBundle.entry.find((e: any) => e.resource && e.resource.resourceType == 'Task')!.resource!
        )

        // TODO: Validate Patient Match by Identifier/CR match
        // taskPatient.identifier == patient.identifier (for omang/brn/ppn) or make sure the two are linked in CR

      } else {
        logger.error('Could not find ServiceRequest with Lab Order ID ' + JSON.stringify(labOrderId) + '!')
        return new IpmsErrorBundle('Could not find ServiceRequest with Lab Order ID ' + labOrderId + '!').bundle;
      }

      // Update Obs and DR with Patient Reference
      obs.subject = { reference: 'Patient/' + taskPatient.id }
      dr.subject = { reference: 'Patient/' + taskPatient.id }
      
      // Update DR with based-on
      if(!dr.basedOn) dr.basedOn = []
      if(!task.basedOn) task.basedOn = []

      dr.basedOn.push({ reference: 'ServiceRequest/' + labOrderId })
      task.basedOn.push({ reference: 'DiagnosticReport/' + dr.id })

      // Generate SendBundle with Task, DiagnosticReport, Patient, and Observation
      const entry = createSendBundleEntry(task, dr, obs)

      // TODO: Only send if valid details available
      const sendBundle: R4.IBundle = {
        resourceType: 'Bundle',
        type: BundleTypeKind._transaction,
        entry: entry,
      }

      // Save to SHR
      resultBundle = await saveBundle(sendBundle)
    }
  } catch (error: any) {
    logger.error(`Could not process ORU!\n${error}`)
    return new IpmsErrorBundle(error.toString()).bundle;
  }
  
  return resultBundle
}

function processIpmsPatient(patient: R4.IPatient): any {
  // TODO: Figure out how IPMS stores bcn and ppn
  let omang, bcn, ppn

  const omangEntry = patient.identifier?.find(
    i => i.system && i.system == config.get('bwConfig:omangSystemUrl'),
  )
  const bcnEntry = patient.identifier?.find(
    i => i.system && i.system == config.get('bwConfig:bdrsSystemUrl'),
  )

  const ppnEntry = patient.identifier?.find(
    i => i.system && i.system == config.get('bwConfig:immigrationSystemUrl'),
  )

  const identifierQuery = []

  if (omangEntry) {
    omang = omangEntry.value!
    identifierQuery.push(`${config.get('bwConfig:omangSystemUrl')}|${omang}`)
  } else {
    omang = ''
  }

  if (bcnEntry) {
    bcn = bcnEntry.value!
    identifierQuery.push(`${config.get('bwConfig:bdrsSystemUrl')}|${bcn}`)
  } else {
    bcn = ''
  }

  if (ppnEntry) {
    ppn = ppnEntry.value!
    identifierQuery.push(`${config.get('bwConfig:immigrationSystemUrl')}|${ppn}`)
  } else {
    ppn = ''
  }

  const identifierQueryString = identifierQuery.join(',')

  const options = {
    timeout: config.get('bwConfig:requestTimeout'),
    searchParams: {},
  }

  options.searchParams = {
    identifier: identifierQueryString,
    _revinclude: ['ServiceRequest:patient', 'Task:patient'],
  }

  return { omang: omang, bcn: bcn, ppn: ppn, options: options }
}

function createSendBundleEntry(task: R4.ITask | undefined, dr: R4.IDiagnosticReport | undefined, obs: R4.IObservation | undefined): R4.IBundle_Entry[] {
  const entry = []
  const output = []

  if(dr) {
    output.push({ type: { text: 'DiagnosticReport' }, valueReference: { reference: 'DiagnosticReport/' + dr.id } })  

    entry.push({
      resource: dr,
      request: { method: Bundle_RequestMethodKind._put, url: 'DiagnosticReport/' + dr.id },
    })
  }

  if(obs) {
    entry.push({
      resource: obs,
      request: { method: Bundle_RequestMethodKind._put, url: 'Observation/' + obs.id },
    })
  }

  if (task) {
    task.status = TaskStatusKind._completed
    task.output = output
    entry.push({
      resource: task,
      request: { method: Bundle_RequestMethodKind._put, url: 'Task/' + task.id }
    })
  }

  return entry;
}

