"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got/dist/source";
import { any } from "nconf";

import config from '../lib/config';

const SHR_URL = config.get('fhirServer:baseURL');

// const mpiClient = fhirClient(req, res).client({ serverUrl: mpiUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});
// const shrClient = fhirClient(req, res).client({ serverUrl: shrUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});

export async function getResource(resourceType: any, uri: string) {
  return got.get(`${SHR_URL}${uri}`).json()
}