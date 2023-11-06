import { R4 } from "@ahryman40k/ts-fhir-types"
import config from "../../lib/config"
import logger from "../../lib/winston"
import { getTaskStatus } from "./helpers"
import Hl7MllpSender from "../../lib/hl7MllpSender"
import Hl7WorkflowsBw from "../hl7WorkflowsBw"

export async function sendAdtToIpms(labBundle: R4.IBundle): Promise<R4.IBundle> {
  const status = getTaskStatus(labBundle)

  if (status && status === R4.TaskStatusKind._requested) {
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
      labBundle = setTaskStatus(labBundle, R4.TaskStatusKind._accepted)
    }
  } else {
    logger.info('Order not ready for IPMS.')
  }
  return labBundle
}

export async function sendOrmToIpms(bundles: any): Promise<R4.IBundle> {
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
          labBundle = setTaskStatus(labBundle, R4.TaskStatusKind._inProgress)
        }
        logger.info(`*result:\n${result}\n`)
      }
    }
  } catch (e) {
    logger.error(e)
  }
  return labBundle
}

export async function handleAdtFromIpms(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
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

            await sendPayload({ taskBundle: taskBundle, patient: patient }, topicList.SEND_ORM_TO_IPMS)
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

export async function handleOruFromIpms(translatedBundle: R4.IBundle): Promise<R4.IBundle> {
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