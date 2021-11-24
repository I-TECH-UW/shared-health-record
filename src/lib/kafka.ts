import { Kafka } from "kafkajs";
import config from './config'

export const kafka = new Kafka({
    clientId: "shr-task-runner",
    brokers: config.get("taskRunner:brokers") || ["kafka:9092"]
});

export const producer = kafka.producer({
    maxInFlightRequests: 1,
    idempotent: true,
    transactionalId: "uniqueProducerId",
});

export async function sendPayload(payload: any, topic: string) {
    try {
        await producer.connect();
        await producer.send({
            topic: topic,
            messages: [{ key: "body", value: JSON.stringify(payload) }],
        });
    } catch (e) {
        console.error("Caught Error while sending:", e);
    }
}

export const consumer = kafka.consumer({ groupId: "shr-worker" });

