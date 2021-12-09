"use strict";

import { R4 } from "@ahryman40k/ts-fhir-types";
import { IBundle } from "@ahryman40k/ts-fhir-types/lib/R4";
import express, { Request, Response } from "express";
import got from "got/dist/source";
import URI from "urijs";
import config from "../lib/config";
import logger from "../lib/winston";
import Hl7Workflows from '../workflows/hl7';

const querystring = require('querystring');

export const router = express.Router();

// Save ORU message as a lab bundle
router.post('/oru', async (req: Request, res: Response) => {
  try {
    let hl7Msg = req.body.trim()

    let resultBundle: R4.IBundle = await Hl7Workflows.saveOruMessage(hl7Msg)

    return res.status(200).json(resultBundle)

  } catch (error) {
    logger.error(`/oru: failed!\n${error}`)
    return res.status(500).json(error)
  }

})

// Get list of HL7 OBR messages targeted at a given facility
//    * Translates ServiceRequests that target a given facility and are active
router.get('/obr/list/:facilityCode', async (req: Request, res: Response) => {

  try {
    // Get all active ServiceRequest Profiles targeting facility with facilityCode
    let uri = URI(config.get("fhirServer:baseUrl"))
      .segment("ServiceRequest")
      .addQuery('performer', req.params.facilityCode)
      .addQuery('status', 'active')

    uri = URI(config.get("fhirConverterUrl")).segment("convert").segment("fhir")

    // let hl7Msg = await got.post(uri.toString(), {
    //   username: config.get("mediator:client:id"),
    //   password: config.get("mediator:client:password"),
    //   json: bundle
    // })

    return res.status(200).send("Not Implemented Yet!")
  } catch (error) {
    return res.status(500).json(error)
  }
})

// Get a single OBR representing a given service request.
router.get('obr/:requestId', async (req: Request, res: Response) => {
  return res.status(501).send("Not Implemented")
})

export default router;