import { R4 } from "@ahryman40k/ts-fhir-types";

import {
    R4_IBundle,
    R4_Bundle_Entry,
    R4_ITask,
    R4_IEncounter,
    R4_IPractitioner,
    R4_Bundle_Request,
    R4_Bundle_TypeKind,
} from '@ahryman40k/ts-fhir-types/lib/R4';
import logger from "../../lib/winston";

// Define the type for a Transaction bundle with Task, Encounter, and Practitioner resources
interface ILaboratoryBundle extends R4_IBundle {
    type: R4_Bundle_TypeKind._transaction; // Make sure to only allow 'transaction' as the bundle type
    entry: Array<ILaboratoryBundleEntry>; // Define the entry array using custom type
}

// Define the type for each entry in the Transaction bundle
interface ILaboratoryBundleEntry extends R4_Bundle_Entry {
    resource: R4_ITask | R4_IEncounter | R4_IPractitioner; // Task, Encounter, or Practitioner
    request: R4_Bundle_Request; // For the transaction request details
}


class LaboratoryBundle {
    protected bundle: ILaboratoryBundle;

    constructor(bundle: ILaboratoryBundle) {
        this.bundle = bundle;
    }

    /*
        The following methods represent the topic channels for the Kafka workers to call.
        Each channel should have a corresponding method in the LaboratoryBundle class.
    */

    async mapConcepts(): Promise<this> {
        logger.info('Mapping Concepts!')

        // Add Botswana-specific terminology mappings
        this.bundle = await this.addAllCodings(this.bundle);

        const response: R4.IBundle = await saveBundle(labBundle)

        await this.sendPayload({ bundle: labBundle }, topicList.MAP_LOCATIONS)

        return response

        return this;
    }

    async mapLocations(): Promise<this> {
        logger.info('Mapping Locations!')

        labBundle = await LabWorkflowsBw.addBwLocations(labBundle)
        const response: R4.IBundle = await saveBundle(labBundle)

        await this.sendPayload({ bundle: labBundle }, topicList.SAVE_PIMS_PATIENT)
        await this.sendPayload({ bundle: labBundle }, topicList.SEND_ADT_TO_IPMS)

        logger.debug(`Response: ${JSON.stringify(response)}`)
        return response

        return this;
    }

    async savePimsPatient(): Promise<this> {
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

        return this;
    }

    async saveIpmsPatient(): Promise<this> {
        // Save to CR
        const resultBundle = this.updateCrPatient(registrationBundle)

        // Handle order entry
        this.handleAdtFromIpms(registrationBundle)

        return resultBundle

        return this;
    }

    async sendAdtToIpms(): Promise<this> {
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

    async sendOrderToIpms(): Promise<this> {
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

            const sendBundle = { .``..labBundle }
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

    async handleAdtFromIpms(bundle: IBundle): Promise<this> {
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

                            await this.sendPayload({ taskBundle: taskBundle, patient: patient }, topicList.SEND_ORM_TO_IPMS)
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



    getBundle(): R4.IBundle {
        return this.bundle;
    }


    protected async addAllCodings(labBundle: ILaboratoryBundle): Promise<ILaboratoryBundle> {
        try {
            for (const e of labBundle.entry!) {
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
                else {
                    logger.info`No Codings to Translate`
                }
            }
        } catch (e) {
            logger.error(e)
        }
        return labBundle
    }
}



class PIMSLaboratoryBundle extends LaboratoryBundle {

}

class IPMSLaboratoryBundle extends LaboratoryBundle {

}
