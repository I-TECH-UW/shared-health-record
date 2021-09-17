"use strict";

import { R4 } from "@ahryman40k/ts-fhir-types";
import express, { Request, Response } from "express";
import got from "got/dist/source";
import URI from "urijs";
import { saveLabBundle } from "../hapi/lab";
import config from "../lib/config";

export const router = express.Router();

// Translate ORU message to lab bundle
router.post('/oru', async (req: Request, res: Response) => {
  try {
    let hl7Msg = req.body

    // Translate into FHIR Bundle
    let translatedBundle: R4.IBundle = await got.post(config.get("fhirConverterUrl") + "/convert/hl7v2/ORU_R01.hbs", { body: hl7Msg }).json()
  
    // Save to SHR
    let resultBundle: R4.IBundle = <R4.IBundle>(await saveLabBundle(translatedBundle))
    return res.status(200).json(resultBundle)

  } catch (error) {
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