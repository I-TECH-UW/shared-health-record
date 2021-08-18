  "use strict";
import express, { Request, Response } from "express";
import got from "got/dist/source";

import logger from '../lib/winston';
import { R4 } from '@ahryman40k/ts-fhir-types';
import config from '../lib/config';
import { LaboratoryWorkflows } from "../workflows/lab";
import { invalidBundleMessage, invalidBundle } from "../lib/helpers";
import { saveBundle } from "../hapi/lab";

export const router = express.Router();

router.all('/', async (req: Request, res: Response) => {
  if(req.method == "POST" || req.method == "PUT") {
    logger.info('Received a Lab Order bundle to save.')
    let orderBundle: R4.IBundle = req.body
  
    // Validate Bundle
    if (invalidBundle(orderBundle)) {
      return res.status(400).json(invalidBundleMessage())
    }
    
    let resultBundle: R4.IBundle = <R4.IBundle>(await saveBundle(orderBundle))
    
    return res.status(200).json(resultBundle)
  }
});

// Create a new lab order in SHR based on bundle 
// (https://i-tech-uw.github.io/emr-lis-ig/Bundle-example-emr-lis-bundle.html)
// router.post('/'), async (req: Request, res: Response) => {
//   logger.info('Received a Lab Order bundle to save');
//   let orderBundle: R4.IBundle = req.body

//   // Validate Bundle
//   if (invalidBundle(orderBundle)) {
//     return res.status(400).json(invalidBundleMessage())
//   }

//   let result: any = await saveBundle(orderBundle)
  
//   return res.status(result.statusCode).json(result.body)
// }

// Get list of active orders targetting :facility
router.get('/orders/target/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url);
});

// Get
router.get('/orders/source/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url);
});



router.put('/orders/:id')

// // Create resource
// router.post('/orders', (req, res) => {
//     saveResource(req, res);
// });
  
// // Update resource
// router.put('/:resourceType/:id', (req, res) => {
//     saveResource(req, res);
// });
  
export default router;