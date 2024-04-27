import { MllpServer } from '@i-tech-uw/mllp-server'
import logger from './winston'
import { WorkflowHandler, topicList } from '../workflows/botswana/workflowHandler'

export default class Hl7MllpSender {
  targetIp: string
  targetPort: number
  mllpServer: MllpServer
  retries: number
  retryInterval: number

  private static instance: Hl7MllpSender;

  constructor(targetIp: string, targetPort: number, retries = 3, retryInterval = 10000) {
    this.targetPort = targetPort
    this.targetIp = targetIp
    this.retries = retries
    this.retryInterval = retryInterval
    this.mllpServer = new MllpServer(targetIp, targetPort, logger)
  }

  public static getInstance(targetIp: string, targetPort: number): Hl7MllpSender {
    if (!Hl7MllpSender.instance) {
      Hl7MllpSender.instance = new Hl7MllpSender(targetIp, targetPort)
    }
    return Hl7MllpSender.instance
  }


  /**
   *
   * @returns Promise
   */
  send(message: string, targetIp?: string, port?: number, retries?: number): any {
    if(!targetIp) {
      targetIp = this.targetIp;
    }
    
    if(!port) {
      port = this.targetPort;
    }

    if(!retries) {
      retries = this.retries
    }

    message = message.replace(/[\n\r]/g, '\r')
    const firstNewline = message.match(/\r/)
    const header = firstNewline ? message.substring(0, firstNewline.index) : ''

    return new Promise((resolve, reject) => {
      this.mllpServer.send(targetIp, port, message, (err: any, ackData: any) => {
        logger.info(
          `Sending HL7 message ${header}!\n      err: ${err ? err : ''}\n      ackData: ${
            ackData ? ackData : ''
          }`,
        )
        if (err) {
          reject({ error: err, retries: retries })
        } else {
          logger.info(
            `Successfully sent HL7 message ${header} \n      with ${retries} retries left!`,
          )
          resolve(ackData)
        }
      })
    })
      .then(ackData => {
        return ackData
      })
      .catch(e => {
        if (e.retries > 0) {
          logger.info(`Retrying... ${e.retries} retries left`)
          return setTimeout(() => this.send(message, targetIp, port, retries - 1), this.retryInterval)
        } else {
          logger.error(`Failed to send HL7 message ${header}!`)

          // Send to DMQ
          WorkflowHandler.sendPayload({message: message, targetIp: this.targetIp, port: port}, topicList.DMQ)

          return e.error
        }
      })
  }
}

const hl7Sender = Hl7MllpSender.getInstance('127.0.0.1', 3000);

export { hl7Sender };
