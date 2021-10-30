import express, {Request, Response} from 'express'
import _ from 'lodash'
import fs from 'fs'
import cookieParser from 'cookie-parser'
import logger from './lib/winston'
import config from './lib/config'
import fhirRoutes from './routes/fhir'
import ipsRoutes from './routes/ips'
import labRoutes from './routes/lab'
import labBwRoutes from './routes/lab-bw'
import hl7Routes from './routes/hl7'

const swaggerUi = require('swagger-ui-express')
const swaggerJSDoc = require('swagger-jsdoc')
const medUtils = require('openhim-mediator-utils')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let authorized = false

const swaggerSpec = swaggerJSDoc({
  swaggerDefinition: {
      info: {
          title: 'FHIR Converter API',
          // If changing the version update the checks in convert/hl7 and convert/hl7/:template
          version: '1.0'
      }
  },
  apis: ['./routes/*.js']
});
/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();

  app.use(express.json({
    limit: '10Mb',
    type: ['application/fhir+json', 'application/json+fhir', 'application/json']
  }));
  
  app.use(express.text())

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  app.use(cookieParser());
  app.use('/ips', ipsRoutes)
  app.use('/fhir', fhirRoutes)
  app.use('/lab', labBwRoutes)
  app.use('/hl7', hl7Routes)

  app.get('/', (req: Request, res: Response) => {
    return res.redirect('/api-docs');
  });

  return app;
}



// tmpConfig seems to be a temporary storage for a config file that gets grabbed from 
// OpenHIM - not sure why it was not in .gitignore
 function reloadConfig(data: JSON, callback: Function) {
  const tmpFile = `${__dirname}/../config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data), err => {
    if (err) {
      throw err;
    }
    config.file(tmpFile);
    return callback();
  });
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
export function start(callback: Function) {
  // Run as OpenHIM Mediator - We only need this approach

  // Loads app config based on the required environment
  const env = process.env.NODE_ENV || 'development';
  const configFile = require(`${__dirname}/../config/config_${env}`);
  // Loads OpenHIM mediator config
  const mediatorConfig = require(`${__dirname}/../config/mediator_${env}`);

  logger.info('Running SHR as a mediator with' + `${__dirname}/../config/mediator_${env}`);
  
  medUtils.registerMediator(config.get('mediator:api'), mediatorConfig, (err: Error) => {
    if (err) {
      logger.error('Failed to register mediator at '+config.get('mediator:api:apiURL')+'\nCheck your config!\n');
      logger.error(err.stack!)
      process.exit(1);
    } else {
      config.set('mediator:api:urn', mediatorConfig.urn);
      medUtils.fetchConfig(config.get('mediator:api'), (err2: Error, newConfig: JSON) => {
        if (err2) {
          logger.info('Failed to fetch initial config');
          process.exit(1);
        }
  
        // Merges configs?
        const updatedConfig: JSON = Object.assign(configFile, newConfig);
        reloadConfig(updatedConfig, () => {
          config.set('mediator:api:urn', mediatorConfig.urn);
          logger.info('Received initial config:', newConfig);
          logger.info('Successfully registered mediator!');
  
          const app = appRoutes();
  
          // Start up server on 3000 (default)
          const server = app.listen(config.get('app:port'), () => {
  
            // Activate heartbeat for OpenHIM mediator
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));
  
            // Updates config based on what's sent from the server
            configEmitter.on('config', (newConfig: JSON) => {
              logger.info('Received updated config:', newConfig);
              const updatedConfig = Object.assign(configFile, newConfig);
              reloadConfig(updatedConfig, () => {
                config.set('mediator:api:urn', mediatorConfig.urn);
              });
            });
            callback(server);
          });
        });
      });  
    }
  });
}

if (!module.parent) {
  // if this script is run directly, start the server
  start(() =>
    logger.info(`Server is running and listening on port: ${config.get('app:port')}`)
  );
}