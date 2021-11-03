import _ from 'lodash'
import logger from './lib/winston'
import config from './lib/config'
import { ShrMediator } from './lib/shrMediator'
import { MllpAdapter } from './lib/mllpAdapter';

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

if (require.main === module) {
  let shrMediator = new ShrMediator(() => logger.info(`SHR Server is running and listening on port: ${config.get('app:port')}`))
  let mllpAdapter = new MllpAdapter(() => logger.info(`TCP Server is up and listening on port: ${ config.get('app:mllpPort')}`))
  
  shrMediator.start()
  mllpAdapter.start()
}