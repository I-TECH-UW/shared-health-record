import nconf from 'nconf';
const env = process.env.NODE_ENV || 'dev';

nconf.argv()
  .env()
  .file(`${__dirname}/../config/config_${env}_template.json`);

export {nconf as config} 
export default nconf;
