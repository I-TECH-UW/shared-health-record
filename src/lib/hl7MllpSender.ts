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
  send(message: string) {
    message = message.replace(/[\n\r]/g, '\r')
    return new Promise((resolve, reject) => {
      this.mllpServer.send(this.targetIp, this.targetPort, message, (err: any, ackData: any) => {
        logger.info(`Sent message!\nerr: ${err}\nackData: ${ackData}`)
        if (err) {
          reject(ackData)
        } else {
          resolve(ackData)
        }
      })
    })
  }
}
