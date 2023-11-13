import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import { MllpServer } from '@i-tech-uw/mllp-server'
import config from '../lib/config'
import logger from '../lib/winston'
import Hl7WorkflowsBw from '../workflows/botswana/hl7Workflows'

import { Logger } from 'winston'

import * as hl7 from 'hl7'

export default class MllpAdapter {
  start(callback: { (): Logger; (): any }) {
    const mllpServer = new MllpServer('0.0.0.0', config.get('app:mllpPort'), logger)

    mllpServer.listen((err: Error) => callback())

    mllpServer.on('hl7', async (data: any) => {
      const start: string = data.substring(0, 3)
      const checkChar: string = data[data.length - 1]
      if (checkChar == '\r') {
        const response: IBundle = await this.handleMessage(data)

        logger.info('HL7 Response:\n' + JSON.stringify(response))
      } else {
        logger.warn('Malformed HL7 Message:\n' + data)
      }
    })
  }

  public async handleMessage(data: any): Promise<any> {
    try {
      logger.info('received payload:', data)
      // Determine Message Type
      const parsed = hl7.parseString(data)
      const msgType: string = parsed[0][9][0][0]

      if (msgType == 'ADT') {
        logger.info('Handling ADT Message')
        return Hl7WorkflowsBw.handleAdtMessage(data)
      } else if (msgType == 'ORU') {
        logger.info('Handling ORU Message')
        return Hl7WorkflowsBw.handleOruMessage(data)
      } else {
        logger.error('Message unsupported!')
        return {
          type: BundleTypeKind._transactionResponse,
          resourceType: 'Bundle',
          entry: [{ response: { status: '501 Not Implemented' } }],
        }
      }
    } catch (error) {
      logger.error(error)
      return {
        type: BundleTypeKind._transactionResponse,
        resourceType: 'Bundle',
        entry: [{ response: { status: '500 Server Error' } }],
      }
    }
  }
}
