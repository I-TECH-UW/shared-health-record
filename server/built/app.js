"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = void 0;
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const openhim_mediator_utils_1 = __importDefault(require("openhim-mediator-utils"));
const fs_1 = __importDefault(require("fs"));
const winston_1 = __importDefault(require("./winston"));
const config_1 = __importDefault(require("./config"));
const fhir_1 = __importDefault(require("./routes/fhir"));
const ips_1 = __importDefault(require("./routes/ips"));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let authorized = false;
/**
 * @returns {express.app}
 */
function appRoutes() {
    const app = express_1.default();
    app.use(body_parser_1.default.json({
        limit: '10Mb',
        type: ['application/fhir+json', 'application/json+fhir', 'application/json']
    }));
    app.use('/ips', ips_1.default);
    app.use('/fhir', fhir_1.default);
    app.get('/', (req, res) => {
        return res.status(200).send(req.url);
    });
    return app;
}
/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
// tmpConfig seems to be a temporary storage for a config file that gets grabbed from 
// OpenHIM - not sure why it was not in .gitignore
function reloadConfig(data, callback) {
    const tmpFile = `${__dirname}/../config/tmpConfig.json`;
    fs_1.default.writeFile(tmpFile, JSON.stringify(data), err => {
        if (err) {
            throw err;
        }
        config_1.default.file(tmpFile);
        return callback();
    });
}
function start(callback) {
    // Run as OpenHIM Mediator - We only need this approach
    // Loads app config based on the required environment
    const env = process.env.NODE_ENV || 'dev';
    const configFile = require(`${__dirname}/../config/config_${env}_template`);
    // Loads OpenHIM mediator config
    const mediatorConfig = require(`${__dirname}/../config/mediator_${env}`);
    winston_1.default.info('Running client registry as a mediator');
    openhim_mediator_utils_1.default.registerMediator(config_1.default.get('mediator:api'), mediatorConfig, (err) => {
        if (err) {
            winston_1.default.error('Failed to register this mediator, check your config');
            winston_1.default.error(err.stack);
            process.exit(1);
        }
        config_1.default.set('mediator:api:urn', mediatorConfig.urn);
        openhim_mediator_utils_1.default.fetchConfig(config_1.default.get('mediator:api'), (err2, newConfig) => {
            if (err2) {
                winston_1.default.info('Failed to fetch initial config');
                winston_1.default.info(err2.stack);
                process.exit(1);
            }
            // Merges configs?
            const updatedConfig = Object.assign(configFile, newConfig);
            reloadConfig(updatedConfig, () => {
                config_1.default.set('mediator:api:urn', mediatorConfig.urn);
                winston_1.default.info('Received initial config:', newConfig);
                winston_1.default.info('Successfully registered mediator!');
                const app = appRoutes();
                // Start up server on 3000 (default)
                const server = app.listen(config_1.default.get('app:port'), () => {
                    // Activate heartbeat for OpenHIM mediator
                    const configEmitter = openhim_mediator_utils_1.default.activateHeartbeat(config_1.default.get('mediator:api'));
                    // Updates config based on what's sent from the server
                    configEmitter.on('config', (newConfig) => {
                        winston_1.default.info('Received updated config:', newConfig);
                        const updatedConfig = Object.assign(configFile, newConfig);
                        reloadConfig(updatedConfig, () => {
                            config_1.default.set('mediator:api:urn', mediatorConfig.urn);
                        });
                    });
                    callback(server);
                });
            });
        });
    });
}
exports.start = start;
if (!module.parent) {
    // if this script is run directly, start the server
    start(() => winston_1.default.info(`Server is running and listening on port: ${config_1.default.get('app:port')}`));
}
//# sourceMappingURL=app.js.map