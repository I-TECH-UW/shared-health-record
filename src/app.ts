import _ from 'lodash'
import logger from './lib/winston'
import config from './lib/config'
import { run } from './server/kafkaWorkers'
import { ShrMediator } from './server/shrMediator'
import MllpAdapter from './server/mllpAdapter';

if (require.main === module) {
  if (config.get("app:port")) {
    try {
      let shrMediator = new ShrMediator()
      shrMediator.start(() => logger.info(`SHR Server is running and listening on port: ${config.get('app:port')}`))
    } catch (error) {
      logger.error("Could not start SHR Mediator!")
    }
  }

  if (config.get("app:mllpPort")) {
    try {
      let mllpAdapter = new MllpAdapter()
      mllpAdapter.start(() => logger.info(`TCP Server is up and listening on port: ${config.get('app:mllpPort')}`))

    } catch (error) {
      logger.error("Could not start MLLP Interceptor!")
    }
  }

  // TODO: Extract to separate project / package
  if (true) { //config.get("app:taskRunner:brokers")) {

    run().catch(logger.error)

  }
}