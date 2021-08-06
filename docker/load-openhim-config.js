'use strict';

const fs = require('fs');
const got = require('got');
const utils = require('openhim-mediator-utils');
const crypto = require('crypto');

const { config } = require("../dist/lib/config");
const logger = require('../dist/lib/winston');

let ohConfig = JSON.parse(fs.readFileSync('docker/test-openhim-config.json'));

(async () => {
  try {
    await metadataPost(
      config.get("mediator:api:apiURL")+"/metadata", 
      ohConfig,
      config.get("mediator:api:username"),
      config.get("mediator:api:password"),
      !config.get("mediator:api:trustSelfSigned")
    );

    logger.info(`Successfully configured OpenHIM at ${config.get("mediator:api:apiURL")}`);
    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();

async function metadataPost(url, conf, user, pw, rejectUnauthorized) {
  let urn = new URL(url);

  let authResponse = await got.get(`${urn.protocol}//${urn.host}/authenticate/${user}`, { https: { rejectUnauthorized: rejectUnauthorized } }).json()
  let salt = authResponse.salt;
  
  let shasum = crypto.createHash('sha512');
  shasum.update(salt + pw);
  let passhash = shasum.digest('hex')

  let now = new Date();
  shasum = crypto.createHash('sha512');
  shasum.update(passhash + salt + now);
  let token = shasum.digest('hex');

  let headers = {
    'auth-username': user,
    'auth-ts': now,
    'auth-salt': salt,
    'auth-token': token
  };

  return got.post(url, { 
    headers: headers,
    https: { rejectUnauthorized: rejectUnauthorized }, 
    json: conf
  }).json();
}