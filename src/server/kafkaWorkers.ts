import { Consumer, EachMessagePayload } from 'kafkajs'
import { consumer } from '../lib/kafka'
import logger from '../lib/winston'
import { LabWorkflowsBw, topicList } from '../workflows/labWorkflowsBw'
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
  const k: Consumer = consumer

  await k.connect()

  for (const val of Object.values(topicList)) {
    await k.subscribe({ topic: val, fromBeginning: false })
  }

  await k.run({
    eachMessage: async function ({ topic, partition, message }: EachMessagePayload) {
      logger.info(`Recieved message from topic ${topic} on partition ${partition}`)

      try {
        let val = ''
        const res = null

        if (message.value) {
          val = message.value.toString()
        }

        LabWorkflowsBw.executeTopicWorkflow(topic, val)
      } catch (error) {
        logger.error(`Could not complete task from topic ${topic}!`)

        logger.error(error)
      }
    }
  })

  errorTypes.map(type => {
    process.on(type, async e => {
      try {
        console.log(`process.on ${type}`)
        console.error(e)
        await k.disconnect()
        process.exit(0)
      } catch (_) {
        process.exit(1)
      }
    })
  })

  signalTraps.map(type => {
    process.once(type, async () => {
      try {
        await k.disconnect()
      } finally {
        process.kill(process.pid, type)
      }
    })
  })
}
