import * as fs from 'fs'
import { config } from '../lib/config'
import shrApp from '../lib/shr'
import logger from '../lib/winston'

import medUtils from 'openhim-mediator-utils'

const env = process.env.NODE_ENV || 'development'
const medConfig = JSON.parse(
  fs.readFileSync(`${__dirname}/../../config/config_${env}.json`, 'utf-8'),
)
const appConfig = JSON.parse(
  fs.readFileSync(`${__dirname}/../../config/mediator_${env}.json`, 'utf-8'),
)

export class ShrMediator {
  private config: JSON

  constructor() {
    this.config = medConfig
  }

  public start(callback: any) {
    logger.info('Running SHR as a mediator with' + `${__dirname}/${this.config}`)
    try {
      medUtils.registerMediator(
        config.get('mediator:api'),
        this.config,
        ShrMediator.registrationCallback(callback),
      )
    } catch (e: any) {
      logger.error(`Could not start SHR as a Mediator!\n${JSON.stringify(e)}`)
      process.exit(1)
    }
  }

  private static registrationCallback(callback: any) {
    return (err: Error | null) => {
      if (err) {
        logger.error(
          'Failed to register mediator at ' +
            config.get('mediator:api:apiURL') +
            '\nCheck your config!\n',
        )
        logger.error(err.stack!)
        process.exit(1)
      } else {
        config.set('mediator:api:urn', medConfig.urn)

        medUtils.fetchConfig(config.get('mediator:api'), ShrMediator.setupCallback(callback))
      }
    }
  }

  private static setupCallback(callback: any) {
    return (err: Error | null, initialConfig: JSON) => {
      if (err) {
        logger.info('Failed to fetch initial config')
        process.exit(1)
      }

      // Merges configs?
      const updatedConfig: JSON = Object.assign(appConfig, initialConfig)
      logger.info('Received initial config:', initialConfig)

      this.reloadConfig(updatedConfig, ShrMediator.startupCallback(callback))
    }
  }

  private static startupCallback(callback: any) {
    return () => {
      try {
        config.set('mediator:api:urn', medConfig.urn)
        logger.info('Successfully registered mediator!')

        const app = shrApp()
        const port = config.get('app:port')

        // Start up server on 3000 (default)
        const server = app.listen(port, () => {
          // Activate heartbeat for OpenHIM mediator
          try {
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'))

            // Updates config based on what's sent from the server
            configEmitter.on('config', ShrMediator.updateCallback)

            // Runs initial callback
            callback(server)
          } catch (error) {
            logger.error(error)
          }
        })
      } catch (error) {
        logger.error(error)
      }
    }
  }

  private static updateCallback(newConfig: JSON) {
    logger.info('Received updated config:', newConfig)

    const updatedConfig = Object.assign(appConfig, newConfig)

    ShrMediator.reloadConfig(updatedConfig, () => {
      config.set('mediator:api:urn', medConfig.urn)
    })
  }

  private static reloadConfig(data: JSON, callback: any) {
    const tmpFile = `${__dirname}/../../config/tmpConfig.json`

    fs.writeFile(tmpFile, JSON.stringify(data), (err: Error | null) => {
      if (err) {
        throw err
      }
      config.file(tmpFile)

      return callback()
    })
  }
}
