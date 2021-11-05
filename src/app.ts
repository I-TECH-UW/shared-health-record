import _ from 'lodash'
import logger from './lib/winston'
import config from './lib/config'
import { ShrMediator } from './lib/shrMediator'

import { MllpServer } from '@b-techbw/mllp'

var server = new MllpServer('127.0.0.1', 1234);

// Subscribe to inbound messages
server.on('hl7', function (data: any){
    console.log('received payload:', data);
});

if (require.main === module) {
  let shrMediator = new ShrMediator(() => logger.info(`SHR Server is running and listening on port: ${config.get('app:port')}`))
  shrMediator.start()
  
  if( config.get("app:mllpPort")) {
    let mllpServer = new MllpServer("localhost", config.get('app:mllpPort'), logger)
    
    mllpServer.listen(() => logger.info(`TCP Server is up and listening on port: ${ config.get('app:mllpPort')}`))

    mllpServer.on('hl7', (data) => {
      // TODO: Attach Handler Here
      console.log('received payload:', data);
    });     
  }
}