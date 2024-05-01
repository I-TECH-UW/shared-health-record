'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got/dist/source'
import config from '../../lib/config'
import logger from '../../lib/winston'
import { WorkflowHandler, topicList } from './workflowHandler'
import { KafkaProducerUtil } from '../../lib/kafkaProducerUtil'
import { KafkaConfig, logLevel } from 'kafkajs'

const brokers = config.get('taskRunner:brokers') || ['kafka:9092']

export default class Hl7WorkflowsBw {
  private static kafkaProducer: KafkaProducerUtil | null = null;

  public static async initKafkaProducer() {
    if (!this.kafkaProducer) {
      const hl7ProducerConfig: KafkaConfig = {
        clientId: 'dead-message-producer',
        brokers: brokers,
        logLevel: config.get('taskRunner:logLevel') || logLevel.ERROR,
      }
      this.kafkaProducer = new KafkaProducerUtil(hl7ProducerConfig, (report) => {
        logger.info('HL7 message delivery report:', report);
      })
      await this.kafkaProducer.init();
    }
  }

  public static errorBundle: IBundle = {
    resourceType: 'Bundle',
    type: BundleTypeKind._transactionResponse,
    entry: [
      {
        response: {
          status: '500 Server Error',
        },
      },
    ],
  }

  // GET Lab Orders via HL7v2 over HTTP - ORU Message
  static async handleOruMessage(hl7Msg: string): Promise<R4.IBundle> {
    try {
      const translatedBundle: R4.IBundle = await Hl7WorkflowsBw.translateBundle(
        hl7Msg,
        'bwConfig:fromIpmsOruTemplate',
      )

      if (translatedBundle != this.errorBundle && translatedBundle.entry) {
        WorkflowHandler.sendPayload({ bundle: translatedBundle }, topicList.HANDLE_ORU_FROM_IPMS)
        return translatedBundle
      } else {
        return this.errorBundle
      }
    } catch (error: any) {
      logger.error(`Could not save ORU message!\n${JSON.stringify(error)}`)
      return this.errorBundle
    }
  }

  static async handleAdtMessage(hl7Msg: string): Promise<void> {
    try {
      WorkflowHandler.sendPayloadWithRetryDMQ({ message: hl7Msg }, topicList.HANDLE_ADT_FROM_IPMS)
    } catch (error: any) {
      logger.error(`Could not translate and save ADT message!\n${JSON.stringify(error)}`)
    }
  }

  static async translateBundle(hl7Msg: string, templateConfigKey: string) {
    const maxRetries = config.get('retryConfig:translatorMaxRetries') || 5;
    const delay = config.get('retryConfig:translatorRetryDelay') || 2000;

    // The errorCheck function defines the criteria for retrying based on the operation's result
    const errorCheck = (result: R4.IBundle) => result === this.errorBundle;

    // Define the payload for DMQ in case of failure
    const payloadForDMQ = { hl7Msg, templateConfigKey };

    // Use the retryOperation method with the new errorCheck criteria
    return await this.retryOperation(
        () => this.getHl7Translation(hl7Msg, config.get(templateConfigKey)),
        maxRetries, 
        delay, 
        errorCheck,
        payloadForDMQ
    );
  }

  static async getHl7Translation(hl7Message: string, template: string): Promise<R4.IBundle> {
    try {
      const translatedMessage: any = await got({
        url: `${config.get('fhirConverterUrl')}/convert/hl7v2/${template}`,
        headers: {
          'content-type': 'text/plain',
        },
        body: hl7Message.replace(/\r/g, '\n'),
        method: 'POST',
        https: {
          rejectUnauthorized: false,
        },
        username: config.get('mediator:client:username'),
        password: config.get('mediator:client:password'),
      }).json()

      return translatedMessage.fhirResource
    } catch (error: any) {
      logger.error(
        `Could not translate HL7 message\n${hl7Message}\nwith template ${template}!\n${JSON.stringify(
          error,
        )}`,
      )

      return this.errorBundle
    }
  }

  static async getFhirTranslation(bundle: R4.IBundle, template: string): Promise<string> {
    try {
      return await got({
        url: `${config.get('fhirConverterUrl')}/convert/fhir/${template}`,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(bundle),
        method: 'POST',
        https: {
          rejectUnauthorized: false,
        },
        username: config.get('mediator:client:username'),
        password: config.get('mediator:client:password'),
      }).text()
    } catch (error: any) {
      logger.error(
        `Could not translate FHIR Bundle message\n${JSON.stringify(
          bundle,
        )}\n with template ${template}!\n${JSON.stringify(error)}`,
      )
      return ''
    }
  }

  static async getFhirTranslationWithRetry(bundle: R4.IBundle, template: string): Promise<string> {
    // Define your retry parameters
    const maxRetries = config.get('retryConfig:translatorMaxRetries') || 5
    const delay = config.get('retryConfig:translatorRetryDelay') || 2000

    const errorCheck = (result: R4.IBundle) => result === this.errorBundle;

    const payloadForDMQ = { bundle, template };

    return await this.retryOperation(
      () => this.getFhirTranslation(bundle, template),
      maxRetries,
      delay,
      errorCheck,
      payloadForDMQ
    );
  }

  static async retryOperation(func: () => any, maxRetries: number, delay: number, errorCheck: (result: any) => boolean, payloadForDMQ: any) {
    let attempts = 0;
    let result: any;
    while (attempts < maxRetries) {
      try {
        result = await func();
        // Check if the result meets the criteria to be considered successful
        if (!errorCheck(result)) {
          return result; // If result is satisfactory, return it
        }
        // If result is not satisfactory, log and prepare for a retry
        logger.info(`Retry criteria not met, attempt ${attempts + 1} of ${maxRetries}`);
      } catch (error) {
        logger.error(`Error on attempt ${attempts + 1}: ${error}`);
        // If this was the last attempt, handle DMQ logic
        if (attempts === maxRetries - 1) {
          logger.error(`Max retries reached, sending to Kafka DMQ topic. Error: ${error}`);
          await this.initKafkaProducer();
          if (this.kafkaProducer) {
            await this.kafkaProducer.sendMessageTransactionally([{
              topic: 'dmq',
              messages: [{ value: JSON.stringify(payloadForDMQ) }],
            }]);
          }
          throw new Error('Operation failed after maximum retries, message sent to DMQ.');
        }
      }
      // Prepare for the next attempt
      attempts++;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
    // If max retries are reached and the result is still not satisfactory, consider it a failure
    throw new Error('Operation failed after maximum retries based on result criteria.');
  }

}
