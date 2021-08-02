"use strict";
import express, { Request, Response } from "express";
import got from "got/dist/source";

const fhirWrapper = require('../lib/fhir')();

import logger from '../lib/winston';
import { R4 } from '@ahryman40k/ts-fhir-types';
import config from '../lib/config';
import { generateLabBundle } from "../workflows/lab";

export const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    let task: R4.ITask = <R4.ITask>(await got("https://i-tech-uw.github.io/laboratory-workflows-ig/Task-example-laboratory-task-simple-requested.json").json())
    let patient: R4.IPatient = <R4.IPatient>(await got("https://i-tech-uw.github.io/laboratory-workflows-ig/Patient-example-laboratory-patient.json").json())
    
    // Temporary Testing Bundle
    return res.status(200).send(generateLabBundle(task, patient))
});

// Get list of active orders targetting :facility
router.get('/orders/target/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url);
});

// Get
router.get('/orders/source/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url);
});

// Create a new lab order in SHR based on bundle 
// (https://i-tech-uw.github.io/emr-lis-ig/Bundle-example-emr-lis-bundle.html)
router.post('/orders'), (req: Request, res: Response) => {
    // Validate bundle adheres to Profile

    // Validate Facility Codes

    // Handle Patient Identity

    // Save

    let resource = req.body;

    
    fhirWrapper.create(resource, (code: number, _err: any, _response: Response, body: any) => {
        return res.status(code).send(body);
    });
}

router.put('/orders/:id')

// // Create resource
// router.post('/orders', (req, res) => {
//     saveResource(req, res);
// });
  
// // Update resource
// router.put('/:resourceType/:id', (req, res) => {
//     saveResource(req, res);
// });
  