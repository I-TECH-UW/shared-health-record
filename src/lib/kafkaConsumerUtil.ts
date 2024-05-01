import { Consumer, EachBatchPayload, Kafka, KafkaConfig, Message } from 'kafkajs'
import logger from './winston'
import { WorkflowHandler, WorkflowResult, topicList } from '../workflows/botswana/workflowHandler'
import { config } from '../lib/config'
export type EachMessageCallback = (
  topic: string,
  partition: number,
  message: Message,
) => Promise<WorkflowResult>

export class KafkaConsumerUtil {
  private consumer: Consumer | null = null

  constructor(private config: KafkaConfig, private topics: string[], private groupId: string) {}

  public async init(): Promise<void> {
    try {
      this.consumer = await this.createConsumer()
    } catch (err) {
      console.error('Failed to initialize consumer:', err)
      throw err
    }
  }

  private async createConsumer(): Promise<Consumer> {
    const kafka = new Kafka(this.config)
    const consumer = kafka.consumer({
      groupId: this.groupId,
      sessionTimeout: 120000, // 2 minutes
      heartbeatInterval: 30000, // 30 seconds
    })

    await consumer.connect()

    for (const topic of this.topics) {
      await consumer.subscribe({ topic, fromBeginning: false })
    }
    return consumer
  }

  public async consumeTransactionally(eachMessageCallback: EachMessageCallback): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized.')
    }

    await this.consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({
        batch,
        resolveOffset,
        heartbeat,
        isRunning,
        isStale,
      }: EachBatchPayload) => {
        const { topic, partition } = batch

        for (const message of batch.messages) {
          if (!isRunning() || isStale()) return

          logger.info(
            `Consumer | Recieved message from topic ${topic} on partition ${partition} with offset ${message.offset}`,
          )

          const maxRetries = config.get("retryConfig:kafkaMaxRetries") || 2
          let retryCount = 0
          let retryDelay = config.get("retryConfig:kafkaRetryDelay") || 1000
          let res: WorkflowResult | null = null

          while (retryCount < maxRetries) {
            logger.info(`Processing message for ${topic} with retry count ${retryCount}...`)
            try {
              res = await eachMessageCallback(topic, partition, message)

              if (res.success) {
                logger.info(`Workflow result succeeded!`)
                resolveOffset(message.offset)
                await heartbeat()
                break // Break the loop if processing succeeds              }
              } else {
                logger.error(`Workflow result did not succeed: ${JSON.stringify(res.result)}`)
              }
            } catch (error) {
              logger.error(`Error processing message ${message.offset}: ${error}`)
            }

            // Otherwise, retry, both on error, and if the message is not processed successfully
            retryCount++
            if (retryCount >= maxRetries) {
              logger.error(
                `Max retries reached for message ${message.offset}, sending to dead message queue.`,
              )
              resolveOffset(message.offset)

              // Send to DMQ
              WorkflowHandler.sendPayload({ topic: topic, partition: partition, message: message }, topicList.DMQ)

              break
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            retryDelay *= 20 // Double the delay for the next retry
            await heartbeat() // Important to call heartbeat to keep the session alive
          }
        }
      },
    })
  }

  public async shutdown(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect()
    }
  }
}
