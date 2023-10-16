import config from './lib/config'
import logger from './lib/winston'
import { run } from './server/kafkaWorkers'
import MllpAdapter from './server/mllpAdapter'
import { ShrMediator } from './server/shrMediator'

if (require.main === module) {
  if (config.get('app:port')) {
    try {
      const shrMediator = new ShrMediator()
      shrMediator.start(() =>
        logger.info(`SHR Server is running and listening on port: ${config.get('app:port')}`),
      )
    } catch (error) {
      logger.error('Could not start SHR Mediator!')
    }
  }

  if (config.get('app:mllpPort')) {
    try {
      const mllpAdapter = new MllpAdapter()
      mllpAdapter.start(() =>
        logger.info(`TCP Server is up and listening on port: ${config.get('app:mllpPort')}`),
      )
    } catch (error) {
      logger.error('Could not start MLLP Interceptor!')
    }
  }

  // TODO: Extract to separate project / package
  if (config.get('taskRunner:brokers')) {
    run().catch(logger.error)
  }
}
