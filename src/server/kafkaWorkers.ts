import { Consumer } from 'kafkajs'
import { consumer } from '../lib/kafka'
import logger from '../lib/winston'
import { LabWorkflowsBw } from '../workflows/labWorkflowsBw'
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

  await k.connect()

  await k.subscribe({ topic: 'map-concepts', fromBeginning: false })
  await k.subscribe({ topic: 'map-locations', fromBeginning: false })
  await k.subscribe({
    topic: 'send-ipms-message',
    fromBeginning: false,
  })

  await k.run({
    eachMessage: async function ({ topic, partition, message }) {
      logger.info(`Recieved message from topic ${topic}`)

      let val = ''
      let res = null

      if (message.value) {
        val = message.value.toString()
      }

      // logger.info("\n\n#########\nReceived: ", {
      //   partition,
      //   offset: message.offset,
      //   value: val
      // });

      switch (topic) {
        case 'map-concepts':
          res = await LabWorkflowsBw.mapConcepts(JSON.parse(val).bundle)
          break
        case 'map-locations':
          res = await LabWorkflowsBw.mapLocations(JSON.parse(val).bundle)
          break
        case 'send-ipms-message':
          res = await LabWorkflowsBw.createIpmsOrder(JSON.parse(val).bundle)
          break
        default:
          break
      }

      //logger.info(`\n\n##########\nResult: ${JSON.stringify(res)}\n###############`)
    },
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
