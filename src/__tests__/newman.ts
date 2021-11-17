import handleResult from 'jest-runner-newman'
import newman from 'newman'

exports = newman.run({
  collection: `[collection-url]`,
  environment: `[environment-url]`,
  reporters: ['cli'],
  // any other newman configs
}, (err, result) => {
  handleResult(err, result);

  // anything else you want
})