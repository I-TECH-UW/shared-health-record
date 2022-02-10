const request = require("request");
const URI = require("urijs");
const async = require("async");
const config = require("./config");
const logger = require("./winston");
const fs = require("fs");
const Fhir = require("fhir").Fhir;

const init = (callback) => {
  let errFound = false;
  async.parallel({}, () => {
    return callback(errFound);
  });
};
module.exports = {
  init,
};
