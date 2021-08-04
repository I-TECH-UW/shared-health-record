"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import { IBundle } from "@ahryman40k/ts-fhir-types/lib/R4";
import got from "got/dist/source";
import { any } from "nconf";
import URI from "urijs";
import util = require('util');

import config from '../lib/config';
import logger = require("../lib/winston");

const SHR_URL = config.get('fhirServer:baseURL');

const fhirWrapper = require('../lib/fhir')();

// TODO: change source utils to use got() & await pattern
// Promisify fns
let create = util.promisify(fhirWrapper.create)
let get = util.promisify(fhirWrapper.getResource)

// const mpiClient = fhirClient(req, res).client({ serverUrl: mpiUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});
// const shrClient = fhirClient(req, res).client({ serverUrl: shrUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});

export async function getResource(type: string, id: string, params?: any, noCaching?: boolean) {
  // return got.get(`${SHR_URL}/${type}/${id}`).json()
  let resourceData: any, statusCode: number
  let uri = URI(config.get('fhirServer:baseURL'));

  noCaching = (noCaching === undefined) ? true : noCaching

  logger.info('Received a request to get resource of type' + type + ' with id ' + id);

  if (type) {
    uri = uri.segment(type);
  }
  if (id) {
    uri = uri.segment(id);
  }
  if(params && params.length > 0) {
    for (const param in params) {
      uri.addQuery(param, params[param]);
    }  
  }
  let url: string = uri.toString();
  
  logger.info(`Getting ${url}`);

  [resourceData, statusCode] = await get({url: url, noCaching: noCaching});

  return resourceData;
}

// TODO
export async function saveResource() {
  
}

export async function saveBundle(bundle: R4.IBundle) {
  let uri = URI(config.get('fhirServer:baseURL'));

  logger.info(`Posting ${bundle.resourceType} to ${uri.toString()}`);

  bundle.type = R4.BundleTypeKind._transaction
  bundle.link = [{
    relation: "self",
    url: "responding.server.org/fhir"
  }]

  let entry: R4.IBundle_Entry
  for(entry of bundle.entry!) {
    entry.request = {
      method: R4.Bundle_RequestMethodKind._put,
      url: `${entry.resource!.resourceType}/${entry.resource!.id!}`
    }  
  }  

  return await got.post(uri.toString(), {json: bundle}).json()
}