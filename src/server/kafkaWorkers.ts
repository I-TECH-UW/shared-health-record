import { KafkaConfig, Message, logLevel } from 'kafkajs'
import logger from '../lib/winston'
import { WorkflowHandler, WorkflowResult, topicList } from '../workflows/botswana/workflowHandler'
import { config } from '../lib/config'
import { KafkaConsumerUtil } from '../lib/kafkaConsumerUtil'

const errorTypes = ['unhandledRejection', 'uncaughtException']
const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2']
const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

let consumer: KafkaConsumerUtil | null = null

const consumerConfig: KafkaConfig = {
  clientId: 'shr-consumer',
  brokers: brokers,
  logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR,
}

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
  consumer = await initAndConsume(Object.values(topicList))

  errorTypes.map(type => {
    process.on(type, async e => {
      try {
        logger.error(`process.on ${type}`)
        logger.error(e)
        await shutdownConsumer()
        process.exit(0)
      } catch (_) {
        process.exit(1)
      }
    })
  })

  signalTraps.map(type => {
    process.once(type, async () => {
      try {
        await shutdownConsumer()
      } finally {
        process.kill(process.pid, type)
      }
    })
  })
}

async function shutdownConsumer() {
  if (consumer) await consumer.shutdown()
}

const initAndConsume = async (topics: string[]) => {
  const consumer = new KafkaConsumerUtil(consumerConfig, topics, 'shr-consumer-group')
  await consumer.init()
  consumer.consumeTransactionally(processMessage) // No await here
  return consumer
}

async function processMessage(
  topic: string,
  partition: number,
  message: Message,
): Promise<WorkflowResult> {
  // There is no additional error handling in this message, since any exceptions or problems will need to be
  // logged and handled by the Kafka consumer retry logic in the KafkaConsumerUtil class.

  logger.info(`Recieved message from topic ${topic} on partition ${partition}`)

  let val = ''
  const res = null

  if (message.value) {
    val = message.value.toString()
  }

  // This method needs to bubble up any exceptions to the Kafka consumer retry logic in the KafkaConsumerUtil class.
  return await WorkflowHandler.executeTopicWorkflow(topic, val)
}
