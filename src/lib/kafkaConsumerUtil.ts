import { Consumer, ConsumerConfig } from "kafkajs";

export class KafkaConsumerUtil {
  private consumer: Consumer | null = null;

  constructor(private config: ConsumerConfig, private topic: string, private groupId: string) {}

  // Initialize Kafka consumer
  public async init(): Promise<void> {
    try {
      this.consumer = await this.createConsumer();
    } catch (err) {
      console.error('Failed to initialize consumer:', err);
      throw err;
    }
  }

  // Create Kafka consumer
  private async createConsumer(): Promise<Consumer> {
    const kafka = new Kafka(this.config);
    const consumer = kafka.consumer({ groupId: this.groupId });
    await consumer.connect();
    await consumer.subscribe({ topic: this.topic, fromBeginning: true });

    return consumer;
  }

  // Consume messages transactionally
  public async consumeTransactionally(): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized.');
    }

    await this.consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale, transaction }: EachBatchPayload) => {
        const { topic, partition } = batch;
        const transactionalConsumer: Transaction = transaction;

        for (const message of batch.messages) {
          if (!isRunning() || isStale()) return;

          console.log({
            topic,
            partition,
            offset: message.offset,
            value: message.value?.toString(),
          });

          // Your own message processing logic here
          
          resolveOffset(message.offset);
          await heartbeat();
        }

        await transactionalConsumer.commit();
      },
    });
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}