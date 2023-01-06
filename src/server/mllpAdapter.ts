import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import { MllpServer } from '@b-techbw/mllp'
import config from '../lib/config'
import logger from '../lib/winston'
import Hl7WorkflowsBw from '../workflows/hl7WorkflowsBw'

const hl7 = require('hl7')

export default class MllpAdapter {
  start(callback: Function) {
    let mllpServer = new MllpServer('0.0.0.0', config.get('app:mllpPort'), logger)

    mllpServer.on('hl7', async data => {
      let start: string = data.substring(0,3)
      let checkChar: string = data[data.length-1]
      if(checkChar == '\r') {
        let response: IBundle = await this.handleMessage(data)

        logger.info('HL7 Response:\n' + JSON.stringify(response))
      } else {
        logger.warn('Malformed HL7 Message:\n'+data)
      }
      
    })
  }

  private async handleMessage(data: any): Promise<IBundle> {
    try {
      logger.info('received payload:', data)
      // Determine Message Type
      let parsed = hl7.parseString(data)
      let msgType: string = parsed[0][9][0][0]

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
