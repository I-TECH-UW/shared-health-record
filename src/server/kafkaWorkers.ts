import { KafkaConfig, logLevel, Message } from 'kafkajs'
import logger from '../lib/winston'
import { LabWorkflowsBw, topicList } from '../workflows/labWorkflowsBw'
import { config } from '../lib/config'
import { KafkaConsumerUtil } from '../lib/kafkaConsumerUtil'

const errorTypes = ['unhandledRejection', 'uncaughtException']
const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2']
const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

let consumers: KafkaConsumerUtil[] = []

const consumerConfig: KafkaConfig = {
  clientId: 'shr-worker-consumer',
  brokers: brokers,
  logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR
};



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

  consumers = await Promise.all(Object.values(topicList).map(initAndConsume))

  for (const val of Object.values(topicList)) {
    const consumer = new KafkaConsumerUtil(consumerConfig, val, 'shr-worker-group')
    consumers.push(consumer)
    await consumer.init()
    await consumer.consumeTransactionally(processMessage)
  }

  errorTypes.map(type => {
    process.on(type, async e => {
      try {
        logger.error(`process.on ${type}`)
        logger.error(e)
        await shutdownConsumers()
        process.exit(0)
      } catch (_) {
        process.exit(1)
      }
    })
  })

  signalTraps.map(type => {
    process.once(type, async () => {
      try {
        await shutdownConsumers()
      } finally {
        process.kill(process.pid, type)
      }
    })
  })
}

async function shutdownConsumers() {
  for (const consumer of consumers) {
    await consumer.shutdown()
  }
}

const initAndConsume = async (topic: string) => {
  const consumer = new KafkaConsumerUtil(consumerConfig, topic, 'shr-worker-group');
  await consumer.init();
  consumer.consumeTransactionally(processMessage);  // No await here
  return consumer;
};

async function processMessage(topic: string, partition: number, message: Message): Promise<void> {
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