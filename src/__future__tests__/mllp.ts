import handleResult from 'jest-runner-newman'
import newman from 'newman'
import compose from 'docker-compose'
import path from 'path'


describe("MLLP Server", () => {
  beforeAll((done)=>{
    compose.upMany(["openhim-core", "openhim-console", "mongo-db", "openhim-config", "shr-fhir"], { cwd: path.join(__dirname), config: 'ci.docker-compose.yml', log: true })
    .then(
      () => { done() },
      err => { console.log('something went wrong:', err.message)}
    );
  })

  it("Should create a new Patient in the SHR and ")
})

module.exports = newman.run({
  collection: `[collection-url]`,
  environment: `[environment-url]`,
  reporters: ['cli'],
  // any other newman configs
}, (err, result) => {
  handleResult(err, result);

  // anything else you want
})