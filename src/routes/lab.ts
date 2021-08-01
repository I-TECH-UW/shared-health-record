"use strict";
import express, { Request, Response } from "express";
const fhirWrapper = require('../fhir')();

import logger from '../lib/winston';
import { R4 } from '@ahryman40k/ts-fhir-types';
import config from '../lib/config';

export const router = express.Router();

router.get('/', (req: Request, res: Response) => {
    return res.status(200).send(req.url);
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
  