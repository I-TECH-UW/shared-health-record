'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'


import config from '../../lib/config'
import { KafkaProducerUtil } from '../../lib/kafkaProducerUtil'
import logger from '../../lib/winston'
import { KafkaConfig, ProducerRecord } from 'kafkajs'
import { logLevel } from 'kafkajs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hl7 = require('hl7')

const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

const producerConfig: KafkaConfig = {
  clientId: 'shr-producer',
  brokers: brokers,
  logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR
};


export const topicList = {
  MAP_CONCEPTS: 'map-concepts',
  MAP_LOCATIONS: 'map-locations',
  SEND_ADT_TO_IPMS: 'send-adt-to-ipms',
  SEND_ORM_TO_IPMS: 'send-orm-to-ipms',
  SAVE_PIMS_PATIENT: 'save-pims-patient',
  SAVE_IPMS_PATIENT: 'save-ipms-patient',
  HANDLE_ORU_FROM_IPMS: 'handle-oru-from-ipms',
}

export class WorkflowHandler {
  private static kafka = new KafkaProducerUtil(producerConfig, (report) => {
    logger.info('Delivery report:', report);
  });

  // Static instance of the Kafka producer.
  private static kafkaProducerInitialized = false;

  // Initialize Kafka producer when the class is first used.
  public static async initKafkaProducer() {
    if (!this.kafkaProducerInitialized) {
      await this.kafka.init();
      this.kafkaProducerInitialized = true;
    }
  }

  // Shutdown Kafka producer when the application terminates.
  public static async shutdownKafkaProducer() {
    if (this.kafkaProducerInitialized) {
      await this.kafka.shutdown();
      this.kafkaProducerInitialized = false;
    }
  }

  /**
   *
   * To handle a lab order from the PIMS system (https://www.postman.com/itechuw/workspace/botswana-hie/collection/1525496-db80feab-8a77-42c8-aa7e-fd4beb0ae6a8)
   *
   * 1. PIMS sends Lab bundle to SHR (postman trigger)
   * 2. SHR saves bundle and patient, and sets bundle status --> Requested (postman test)
   * 3. SHR saves patient in CR (postman test)
   * 3. SHR translates bundle --> ADT04 HL7 Message (postman request - ADT04_to_IPMS.hbs)
   * 4. SHR sends HL7 Message to IPMS (Request Interceptor Needed - mllp interceptor?)
   *
   * ----- async -----
   * 5. IPMS sends registration message to SHR (mllp test trigger)
   * 6. SHR translates message --> Patient Resource (postman request)
   * 7. Search for patient by some data from patient resource, like Omang / passport # / etc.) (postman request)
   * 8. Get all Task Bundles where status is Requested for the patient in the SHR (postman request)
   * 9. Send patient resource --> CR (postman test)
   * For each Bundle:
   * 10. Translate to ORM message (postman request)
   * 11. Send ORM HL7 message to IPMS and get back ACK  (Request Interceptor Needed - mllp interceptor?)
   * 12. Set Task status --> received / accepted / rejected (postman test)
   *
   * @param orderBundle
   * @param resultBundle
   */

  static async handleBwLabOrder(orderBundle: R4.IBundle, resultBundle: R4.IBundle) {
    try {
      await this.sendPayload({ bundle: orderBundle, response: resultBundle }, topicList.MAP_CONCEPTS)
    } catch (e) {
      logger.error(e)
    }
  }

  static async executeTopicWorkflow(topic: string, val: any) {
    let res
    try {
      switch (topic) {
        case topicList.MAP_CONCEPTS:
          res = await WorkflowHandler.mapConcepts(JSON.parse(val).bundle)
          break
        case topicList.MAP_LOCATIONS:
          res = await WorkflowHandler.mapLocations(JSON.parse(val).bundle)
          break
        case topicList.SAVE_PIMS_PATIENT:
          res = await WorkflowHandler.updateCrPatient(JSON.parse(val).bundle)
          break
        case topicList.SEND_ADT_TO_IPMS:
          res = await WorkflowHandler.sendAdtToIpms(JSON.parse(val).bundle)
          break
        case topicList.SAVE_IPMS_PATIENT:
          res = await WorkflowHandler.saveIpmsPatient(JSON.parse(val).bundle)
          break
        case topicList.SEND_ORM_TO_IPMS:
          res = await WorkflowHandler.sendOrmToIpms(JSON.parse(val))
          break
        case topicList.HANDLE_ORU_FROM_IPMS:
          res = await WorkflowHandler.handleOruFromIpms(JSON.parse(val).bundle)
          break
        default:
          break
      }
      await new Promise(resolve => setTimeout(resolve, 300))

      return res
    } catch (e) {
      logger.error(e)
    }
  }


  /**
   * Sends a payload to a Kafka topic.
   * @param payload - The payload to send.
   * @param topic - The Kafka topic to send the payload to.
   * @returns A Promise that resolves when the payload has been sent.
   */
  public static async sendPayload(payload: any, topic: string) {
    await this.initKafkaProducer();

    const records: ProducerRecord[] = [
      {
        topic: topic,
        messages: [
          { key: 'body', value: JSON.stringify(payload) }
        ],
      },
    ];

    try {
      logger.info(`Sending payload to topic ${topic}: ${JSON.stringify(payload)}`);
      await this.kafka.sendMessageTransactionally(records);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }
}

