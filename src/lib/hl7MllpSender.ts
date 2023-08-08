import { MllpServer } from '@i-tech-uw/mllp-server'
import logger from './winston'

export default class Hl7MllpSender {
  targetIp: string
  targetPort: number
  mllpServer: MllpServer

  constructor(targetIp: string, targetPort: number) {
    this.targetPort = targetPort
    this.targetIp = targetIp
    this.mllpServer = new MllpServer(targetIp, targetPort, logger)
  }

  /**
   *
   * @returns Promise
   */
  send(message: string, retries = 10): any {
    message = message.replace(/[\n\r]/g, '\r')
    const firstNewline = message.match(/\r/)
    const header = firstNewline ? message.substring(0, firstNewline.index) : ''

    return new Promise((resolve, reject) => {
      this.mllpServer.send(this.targetIp, this.targetPort, message, (err: any, ackData: any) => {
        logger.info(
          `!! Sending HL7 message ${header}!\n      err: ${err ? err : ''}\n      ackData: ${
            ackData ? ackData : ''
          }`,
        )
        if (err) {
          reject({ error: err, retries: retries })
        } else {
          logger.info(
            `!! Successfully sent HL7 message ${header} \n      with ${retries} retries left!`,
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
          return setTimeout(() => this.send(message, e.retries - 1), 2000)
        } else {
          logger.error(`!! Failed to send HL7 message ${header}!`)
          return e.error
        }
      })
  }
}
