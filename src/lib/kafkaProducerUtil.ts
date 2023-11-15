import { Kafka, KafkaConfig, Producer, ProducerRecord, Transaction } from 'kafkajs'
import logger from './winston'

type DeliveryReportCallback = (report: any) => void

/**
 * KafkaUtil class provides utility functions to interact with Kafka producer.
 */
export class KafkaProducerUtil {
  private producer: Producer | null = null

  /**
   * Creates an instance of KafkaUtil.
   * @param {KafkaConfig} config - Configuration object for Kafka producer.
   * @param {DeliveryReportCallback} onDeliveryReport - Callback function to handle delivery reports.
   */
  constructor(private config: KafkaConfig, private onDeliveryReport: DeliveryReportCallback) {}

  /**
   * Initializes Kafka producer.
   * @returns {Promise<void>} Promise that resolves when producer is initialized.
   * @throws {Error} If producer initialization fails.
   */
  public async init(): Promise<void> {
    try {
      this.producer = await this.createProducer()
    } catch (err) {
      console.error('Failed to initialize producer:', err)
      throw err
    }
  }

  /**
   * Creates Kafka producer.
   * @returns {Promise<Producer>} Promise that resolves with Kafka producer instance.
   */
  private async createProducer(): Promise<Producer> {
    logger.info('Creating Kafka producer...')
    const kafka = new Kafka(this.config)
    const producer = kafka.producer({
      transactionalId: 'shr-producer-transaction',
      idempotent: true,
      maxInFlightRequests: 1,
    })
    await producer.connect()
    return producer
  }

  /**
   * Sends message using transaction.
   * @param {ProducerRecord[]} records - Array of producer records to send.
   * @returns {Promise<void>} Promise that resolves when message is sent transactionally.
   * @throws {Error} If producer is not initialized or transaction fails.
   */
  public async sendMessageTransactionally(records: ProducerRecord[]): Promise<void> {
    if (!this.producer) {
      logger.error('Producer is not initialized.')
      throw new Error('Producer is not initialized.')
    }

    const transaction: Transaction = await this.producer.transaction()
    try {
      //logger.info('Sending the following records transactionally:');
      //logger.info(JSON.stringify(records, null, 2));
      for (const record of records) {
        await transaction.send(record)
      }
      await transaction.commit()
      logger.info('Message sent transactionally.')
      this.onDeliveryReport({ status: 'committed' })
    } catch (err) {
      await transaction.abort()
      this.onDeliveryReport({ status: 'aborted' })
      throw err
    }
  }

  /**
   * Gracefully shuts down Kafka producer.
   * @returns {Promise<void>} Promise that resolves when producer is disconnected.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down Kafka producer...')
    if (this.producer) {
      await this.producer.disconnect()
    }
  }
}
