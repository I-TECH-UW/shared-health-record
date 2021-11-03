
import * as fs from 'fs'
import { config } from './config'
import logger from 'winston'
import shrApp from './shr'

const medUtils = require('openhim-mediator-utils')


export class ShrMediator {
  private config: any
  private appConfigFile: any
  private callback: Function

  constructor(callback: Function) {
    const env = process.env.NODE_ENV || 'development';
    this.appConfigFile = require(`${__dirname}/../config/config_${env}`);
    this.config = require(`${__dirname}/../config/mediator_${env}`);
    this.callback = callback
  }

  public start() {
    logger.info('Running SHR as a mediator with' + `${__dirname}/${this.config}`)
    try {
      medUtils.registerMediator(config.get('mediator:api'), this.config, this.registrationCallback)
    } catch (e: any) {
      logger.error(`Could not start SHR as a Mediator!\n${JSON.stringify(e)}`)
      process.exit(1)
    }

  }

  private registrationCallback(err: Error | null) {
    if (err) {
      logger.error('Failed to register mediator at ' + config.get('mediator:api:apiURL') + '\nCheck your config!\n');
      logger.error(err.stack!)
      process.exit(1);
    } else {
      config.set('mediator:api:urn', this.config.urn);

      medUtils.fetchConfig(config.get('mediator:api'), this.setupCallback)
    }
  }

  private setupCallback(err: Error | null, initialConfig: JSON) {
    if (err) {
      logger.info('Failed to fetch initial config');
      process.exit(1);
    }

    // Merges configs?
    const updatedConfig: JSON = Object.assign(this.appConfigFile, initialConfig);

    this.reloadConfig(updatedConfig, this.startupCallback);
  }

  private startupCallback(initialConfig: JSON) {
    config.set('mediator:api:urn', this.config.urn);
    logger.info('Received initial config:', initialConfig);
    logger.info('Successfully registered mediator!');

    const app = shrApp()
    const port = config.get('app:port')

    // Start up server on 3000 (default)
    const server = app.listen(port, () => {

      // Activate heartbeat for OpenHIM mediator
      const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));

      // Updates config based on what's sent from the server
      configEmitter.on('config', this.updateCallback);

      // Runs initial callback
      this.callback(server);
    });
  }

  private updateCallback(newConfig: JSON) {

    logger.info('Received updated config:', newConfig);

    const updatedConfig = Object.assign(this.appConfigFile, newConfig);

    this.reloadConfig(updatedConfig, () => {
      config.set('mediator:api:urn', this.config.urn);
    });

  }

  private reloadConfig(data: JSON, callback: Function) {
    const tmpFile = `${__dirname}/../config/tmpConfig.json`;

    fs.writeFile(tmpFile, JSON.stringify(data), (err: Error | null) => {
      if (err) {
        throw err;
      }
      config.file(tmpFile);

      return callback();
    });
  }

}
