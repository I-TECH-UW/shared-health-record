import { consumer } from "../lib/kafka"
import { sendPayload } from "../lib/kafka";
import logger from '../lib/winston'
import { LaboratoryWorkflowsBw } from '../workflows/lab-bw';
import { IBundle } from '@ahryman40k/ts-fhir-types/lib/R4';
import { saveLabBundle } from "../hapi/lab";
import { Consumer } from "kafkajs";
const errorTypes = ['unhandledRejection', 'uncaughtException']
const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'] 

/**
 * Example Botswana Workflow: (synchronous for now)
 * Input: New Order Bundle from PIMS
 * 1. Save To HAPI Server & Send Response Bundle
 * 2a. Add code mappings to Resources (could be anync #1)
 * 2b. Add location mappings to Resources could be async #2)
 * 2c. Validate Patient Data against OpenCR (could be async #3)
 * 3. Send HL7 ADT message to IPMS with Omang
 * 4. Wait for ACK with MRN
 * 5. Send HL7 ORU message to IPMS using MRN
 */

export async function run() {
    let k: Consumer = consumer

    await consumer.connect()
    
    await consumer.subscribe({ topic: "map-concepts", fromBeginning: true })
    await consumer.subscribe({ topic: "map-locations", fromBeginning: true })
    await consumer.subscribe({ topic: "send-ipms-message", fromBeginning: true })

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            logger.info(`Recieved message from topic ${topic}`)

            let val = ""
            let bundle: IBundle
            let response: IBundle

            if (message.value) {
                val = message.value.toString()
            }

            logger.info("Received: ", {
                partition,
                offset: message.offset,
                value: val
            })

            switch (topic) {
                case "map-concepts":
                    logger.info("Mapping Concepts!")
                    bundle = await LaboratoryWorkflowsBw.addBwCodings(JSON.parse(val).bundle)
                    response = await saveLabBundle(bundle)
                    sendPayload({bundle: bundle, response: response}, "map-locations")
                    break
                case "map-locations":
                    logger.info("Mapping Locations!")
                    bundle = await LaboratoryWorkflowsBw.addBwLocations(JSON.parse(val).bundle)
                    response = await saveLabBundle(bundle)
                    sendPayload({bundle: bundle, response: response}, "send-ipms-message")
                    break
                case "send-ipms-message":
                    logger.info("Sending IPMS Message!")
                    
                    break
                default:
                    break
            }
        },
    })

    errorTypes.map(type => {
        process.on(type, async e => {
          try {
            console.log(`process.on ${type}`)
            console.error(e)
            await consumer.disconnect()
            process.exit(0)
          } catch (_) {
            process.exit(1)
          }
        })
      })
      
      signalTraps.map(type => {
        process.once(type, async () => {
          try {
            await consumer.disconnect()
          } finally {
            process.kill(process.pid, type)
          }
        })
      })
};

