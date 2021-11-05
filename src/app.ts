import _ from 'lodash'
import logger from './lib/winston'
import config from './lib/config'
import { ShrMediator } from './server/shrMediator'

import { MllpServer } from '@b-techbw/mllp'
import MllpAdapter from './server/mllpAdapter';

if (require.main === module) {
  if(config.get("app:port")) {
    let shrMediator = new ShrMediator()
    shrMediator.start(() => logger.info(`SHR Server is running and listening on port: ${config.get('app:port')}`))  
  }
  
  if(config.get("app:mllpPort")) {
    let mllpAdapter = new MllpAdapter()
    mllpAdapter.start(() => logger.info(`TCP Server is up and listening on port: ${ config.get('app:mllpPort')}`))  
  }
}