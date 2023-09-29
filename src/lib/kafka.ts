import { Kafka, ProducerConfig, logLevel } from 'kafkajs';
import config from './config'

const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

export const kafka = new Kafka({
  clientId: 'shr-task-runner',
  brokers: brokers,
  logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR
})


const producerConfig: ProducerConfig = {
  // Enable idempotent producers
  idempotent: true,
  // Enable transactionalId to make it transactional
  transactionalId: 'shr-transactional-id',
};

export const producer = kafka.producer(producerConfig);

export async function sendPayload(payload: any, topic: string) {
  await sendMessage(await createTransaction(producer), topic, payload, producer);
};

const cosumerConfig = {
  groupId: 'shr-worker'
}
export const consumer = kafka.consumer(cosumerConfig)


/**
 * Sends a message to a Kafka topic within a transaction.
 * @param transaction - The Kafka transaction object.
 * @param topic - The name of the Kafka topic to send the message to.
 * @param payload - The message payload to send.
 * @param pr - The Kafka producer object.
 * @returns A Promise that resolves when the message is sent and the transaction is committed, or rejects if an error occurs.
 */
export async function sendMessage(transaction: any, topic: string, payload: any, pr: any) {
  try {
    await transaction.send({
      topic: topic,
      messages: [{ key: 'body', value: JSON.stringify(payload) }]
    });

    // You can send more messages to other topics within the same transaction, if needed
    // Committing the transaction
    await transaction.commit();
  } catch (error) {
    console.error('Caught Error while sending:', error);
    // Aborting the transaction in case of an error
    await transaction.abort();
  } finally {
    // Disconnecting the producer
    await pr.disconnect();
  }
}

/**
 * Creates a new transaction by connecting to the provided producer.
 * @param pr The producer to connect to.
 * @returns The newly created transaction.
 */
export async function createTransaction(pr: any) {
  let transaction: any = null;
  try {
    // Connecting to the producer
    await pr.connect();

    // Initializing a transaction
    transaction = await pr.transaction();
  } catch (error) {
    pr.disconnect();
    console.error('Caught Error while connecting:', error);
  }
  return transaction;
}

