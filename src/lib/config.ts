import nconf from 'nconf'

const env = process.env.NODE_ENV || 'ci'

nconf.argv().env().file(`${__dirname}/../../config/config_docker.json`)

export { nconf as config }
export default nconf
