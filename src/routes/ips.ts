"use strict";
import express, { Request, Response } from "express";
import logger from '../winston';
import fhirClient from 'fhirclient';
import { R4 } from '@ahryman40k/ts-fhir-types';
import config from '../config';
import { generateIpsbundle, generateUpdateBundle } from "../ips";

export const router = express.Router();

var sprintf = require('sprintf-js').sprintf;

let system = config.get("app:mpiSystem");

router.get('/', (req: Request, res: Response) => {
  return res.status(200).send(req.url);
});

router.get('/Patient/cruid/:id/:lastUpdated?', async (req: Request, res: Response) => {
  const cruid = req.params.id;
  const lastUpdated = req.params.lastUpdated;
  const mpiUrl = config.get('fhirServer:mpiURL');
  const shrUrl = config.get('fhirServer:baseURL');

  logger.info(sprintf('Received a request for an ISP for patient with cruid: %s | lastUpdagted: %s', cruid, lastUpdated));

  const mpiClient = fhirClient(req, res).client({ serverUrl: mpiUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});
  const shrClient = fhirClient(req, res).client({ serverUrl: shrUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});

  // Fetch records for linked patients from MPI
  let mpiPatients = await mpiClient.request<R4.IPatient[]>(`Patient?_id=${cruid}&_include=Patient:link`, { flat: true });

  let ipsBundle = await generateIpsbundle(mpiPatients, shrClient, lastUpdated, system);

  res.status(200).json(ipsBundle);
});

router.get('/Patient/:id/:lastUpdated?', async (req: Request, res: Response) => {
  const patientId = req.params.id;
  const lastUpdated = req.params.lastUpdated;
  const mpiUrl = config.get('fhirServer:mpiURL');
  const shrUrl = config.get('fhirServer:baseURL');

  logger.info(sprintf('Received a request for an ISP with a bundle of resources\npatient id: %s | lastUpdagted: %s', patientId, lastUpdated));

  // Create Client
  const mpiClient = fhirClient(req, res).client({ serverUrl: mpiUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});
  const shrClient = fhirClient(req, res).client({ serverUrl: shrUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});

  // Query MPI to get all patients
  // TODO: parameterize identifier specifics and account for diffent types of identifiers
  let goldenRecordRes = await mpiClient.request<R4.IPatient[]>(`Patient?identifier=${system}|${patientId}&_include=Patient:link`, { flat: true });
  let goldenRecord = goldenRecordRes.find((x) => (x.meta && x.meta.tag && x.meta.tag[0].code === "5c827da5-4858-4f3d-a50c-62ece001efea"));

  if(goldenRecord) {
    let cruid = goldenRecord.id;
    let mpiPatients = await mpiClient.request<R4.IPatient[]>(`Patient?_id=${cruid}&_include=Patient:link`, { flat: true });
    let ipsBundle = await generateIpsbundle(mpiPatients, shrClient, lastUpdated, system);
    res.status(200).send(ipsBundle);
  } else {
    res.sendStatus(500);
  }
});

router.get('/:location?/:lastUpdated?', (req: Request, res: Response) => {
  const location = req.params.location;
  const lastUpdated = req.params.lastUpdated;
  const query = new URLSearchParams();
  const obsQuery = new URLSearchParams();


  if (lastUpdated) {
    query.set("_lastUpdated", lastUpdated);
    obsQuery.set("_lastUpdated", lastUpdated);
  }

  logger.info(sprintf('Received a request for an ISP with a bundle of resources\nlocation: %s | lastUpdagted: %s', location, lastUpdated));

  // Create Client
  const client = fhirClient(req, res).client({
    serverUrl: config.get('fhirServer:baseURL')
  });

  /**
   * For now:
   * 1. Set lastUpdated and location based on parameters
   * 2. Get all Patients that were lastUpdated and from a given location
   * 3. Get all Encounters that were lastUpdated and from a given location
   * 4. Get all Observations that were lastUpdated and from a given location
   * 5. Combine them into a single bundle w/ composition
   *
   */

  let patientP = client.request<R4.IPatient[]>(`Patient?${query}`, { flat: true });

  if (location) {
    query.set("location", location);
    obsQuery.set("encounter.location", location);
  }
  let encounterP = client.request<R4.IEncounter[]>(`Encounter?${query}`, { flat: true });
  let obsP = client.request<R4.IObservation[]>(`Observation?${obsQuery}`, { flat: true });


  Promise.all([patientP, encounterP, obsP])
    .then(values => {
      res.status(200).json(generateUpdateBundle(values, location));
    })
    .catch(e => {
      res.status(500).render('error', { error: e })
    })

});


export default router;