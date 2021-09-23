"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got/dist/source";
import { resourceUsage } from "process";
import URI from "urijs";
import util = require('util');

import config from '../lib/config';
import logger = require("../lib/winston");

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
  if (params && params.length > 0) {
    for (const param in params) {
      uri.addQuery(param, params[param]);
    }
  }
  let url: string = uri.toString();

  logger.info(`Getting ${url}`);

  [resourceData, statusCode] = await get({ url: url, noCaching: noCaching });

  return resourceData;
}

// TODO
export async function saveResource() {

}

export async function getTaskBundle(patientId: string, locationId: string) {
  let uri = URI(config.get('fhirServer:baseURL'));

  logger.info(`Getting Bundle for patient ${patientId} and location ${locationId}`);

  let requestUri = uri
    .segment('Task')
    .addQuery('patient', patientId)
    .addQuery('owner', locationId)
    .addQuery('_include', '*')
    .addQuery('_revinclude', '*')

  // Get Task and Associated Resources
  return got.get(uri.toString()).json()
}



export async function saveLabBundle(bundle: R4.IBundle, addSimulatedResults: boolean): Promise<R4.IBundle> {
  let uri = URI(config.get('fhirServer:baseURL'));

  logger.info(`Posting ${bundle.resourceType} to ${uri.toString()}`);

  bundle.type = R4.BundleTypeKind._transaction
  bundle.link = [{
    relation: "self",
    url: "responding.server.org/fhir"
  }]

  if (bundle.entry) {
    for (let entry of bundle.entry) {
      if(entry.resource) {
        let resource = entry.resource
        entry.request = {
          method: R4.Bundle_RequestMethodKind._put,
          url: `${resource.resourceType}/${resource.id}`
        }
      }
    }
  }
  let additionalResources: R4.IBundle_Entry[] = []

  bundle.entry = bundle.entry!.concat(additionalResources)

  return got.post(uri.toString(), { json: bundle }).json()
}