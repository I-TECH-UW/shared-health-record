import { Consumer, EachBatchPayload, Kafka, KafkaConfig, Message } from 'kafkajs';
import logger from './winston';

export type EachMessageCallback = (topic: string, partition: number, message: Message) => Promise<void>;

export class KafkaConsumerUtil {
  private consumer: Consumer | null = null;

  constructor(private config: KafkaConfig, private topics: string[], private groupId: string) {}

  public async init(): Promise<void> {
    try {
      this.consumer = await this.createConsumer();
    } catch (err) {
      console.error('Failed to initialize consumer:', err);
      throw err;
    }
  }

  private async createConsumer(): Promise<Consumer> {
    const kafka = new Kafka(this.config);
    const consumer = kafka.consumer({ groupId: this.groupId });
    await consumer.connect();
    for (const topic of this.topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    return consumer;
  }

  public async consumeTransactionally(eachMessageCallback: EachMessageCallback): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized.');
    }

    await this.consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }: EachBatchPayload) => {
        const { topic, partition } = batch;
  
        for (const message of batch.messages) {
          if (!isRunning() || isStale()) return;
  
          logger.info({
            topic,
            partition,
            offset: message.offset,
            value: message.value?.toString(),
          });

          const maxRetries = 6;
          let retryCount = 0;
          let retryDelay = 1000; 
  
          while (retryCount < maxRetries) {
            try {
              await eachMessageCallback(topic, partition, message);
              resolveOffset(message.offset);
              await heartbeat();
              break; // Break the loop if processing succeeds
            } catch (error) {
              logger.error(`Error processing message ${message.offset}: ${error}`);
              retryCount++;
              if (retryCount >= maxRetries) {
                logger.error(`Max retries reached for message ${message.offset}, sending to dead letter queue or similar.`);
                // TODO: handle with DLQ
                break;
              }
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              retryDelay *= 2; // Double the delay for the next retry
              await heartbeat(); // Important to call heartbeat to keep the session alive
            }
          }
        }
      },
    });
  }

  public async shutdown(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}