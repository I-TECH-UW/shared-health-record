import { Kafka, Consumer, EachBatchPayload, Transaction, Message, KafkaConfig, EachMessagePayload } from 'kafkajs';

export type EachMessageCallback = (topic: string, partition: number, message: Message) => Promise<void>;

export class KafkaConsumerUtil {
  private consumer: Consumer | null = null;

  constructor(private config: KafkaConfig, private topic: string, private groupId: string) {}

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
    await consumer.subscribe({ topic: this.topic, fromBeginning: true });

    return consumer;
  }

  public async consumeTransactionally(eachMessageCallback: EachMessageCallback): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized.');
    }

    await this.consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale, transaction }: any) => {
        const { topic, partition } = batch;
        const transactionalConsumer: Transaction = transaction;

        for (const message of batch.messages) {
          if (!isRunning() || isStale()) return;

          await eachMessageCallback(topic, partition, message)

          resolveOffset(message.offset);
          await heartbeat();
        }

        await transactionalConsumer.commit();
      },
    });
  }

  public async shutdown(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}