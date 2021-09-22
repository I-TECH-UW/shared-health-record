"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got/dist/source";
import URI from "urijs";
import util = require('util');
import { v4 as uuidv4 } from 'uuid';

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



export async function saveLabBundle(bundle: R4.IBundle, addResults: boolean): Promise<R4.IBundle> {
  let uri = URI(config.get('fhirServer:baseURL'));

  logger.info(`Posting ${bundle.resourceType} to ${uri.toString()}`);

  bundle.type = R4.BundleTypeKind._transaction
  bundle.link = [{
    relation: "self",
    url: "responding.server.org/fhir"
  }]

  let entry: R4.IBundle_Entry
  let additionalResources: R4.IBundle_Entry[] = []
  if (bundle.entry) {
    for (entry of bundle.entry) {
      if (addResults
        && entry.resource
        && entry.resource.resourceType === "ServiceRequest"
        && entry.resource.basedOn
        && entry.resource.status === "active") {
        let sr: R4.IServiceRequest = entry.resource
        entry.resource.status = "completed"
        additionalResources = additionalResources.concat(generateIpmsResults(sr))
      }
      
      entry.request = {
        method: R4.Bundle_RequestMethodKind._put,
        url: `${entry.resource!.resourceType}/${entry.resource!.id!}`
      }
    }
  }

  bundle.entry = bundle.entry!.concat(additionalResources)

  return got.post(uri.toString(), { json: bundle }).json()
}

export function generateIpmsResults(sr: R4.IServiceRequest): R4.IBundle_Entry[] {
  let srId = sr.id!
  let drId = "ipms-dr-" + uuidv4()
  let obsId = "ipms-obs-" + uuidv4()
  let code = sr.code!
  let srRef: R4.IReference = { reference: "ServiceRequest/" + srId }
  let obsRef: R4.IReference = { reference: "Observation/" + obsId }
  let cellCount = Math.floor(Math.random() * 100 + 50)
  let returnVal: R4.IBundle_Entry[] = []

  let dr: R4.IDiagnosticReport = {
    id: drId,
    resourceType: "DiagnosticReport",
    code: code,
    basedOn: [srRef],
    status: R4.DiagnosticReportStatusKind._final,
    subject: sr.subject,
    result: [obsRef]
  }

  returnVal.push({
    resource: dr,
    request: {
      method: R4.Bundle_RequestMethodKind._put,
      url: `DiagnosticReport/${drId}`
    }
  })

  let obs: R4.IObservation = {
    resourceType: "Observation",
    id: obsId,
    code: code,
    status: R4.ObservationStatusKind._final,
    valueQuantity: {
      value: cellCount,
      unit: "cells per microliter",
      system: "http://hl7.org/fhir/ValueSet/ucum-units",
      code: "{cells}/uL"
    },
    interpretation: [{
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "N" }]
    }],
    referenceRange: [{
      low: {
        value: 50,
        unit: "cells per microliter",
        system: "http://hl7.org/fhir/ValueSet/ucum-units",
        code: "{cells}/uL"
      },
      high: {
        value: 150,
        unit: "cells per microliter",
        system: "http://hl7.org/fhir/ValueSet/ucum-units",
        code: "{cells}/uL"
      }
    }],
    performer: sr.performer,
    basedOn: [srRef]
  }
  
  returnVal.push({
    resource: obs,
    request: {
      method: R4.Bundle_RequestMethodKind._put,
      url: `Observation/${obsId}`
    }
  })

  return returnVal;
}
