"use strict";

import { R4 } from "@ahryman40k/ts-fhir-types";
import express, { Request, Response } from "express";
import got from "got/dist/source";
import URI from "urijs";
import { saveBundle } from "../hapi/lab";
import config from "../lib/config";

export const router = express.Router();

router.post('/oru', async  (req: Request, res: Response) => {
  let hl7Msg = req.body

  // Translate into FHIR Bundle
  let translatedBundle: R4.IBundle = await got.post(config.get("fhirConverterUrl")+"/convert/hl7v2/ORU_R01.hbs", {body: hl7Msg}).json()

  // Save to SHR
  let resultBundle: R4.IBundle = <R4.IBundle>(await saveBundle(translatedBundle))
    
  return res.status(200).json(resultBundle)
}) 

router.get('/obr', async  (req: Request, res: Response) => {
  // Static Temporary for testing
  try {
    let bundle: R4.IBundle = <R4.IBundle>(await got("https://i-tech-uw.github.io/laboratory-workflows-ig/Bundle-example-laboratory-simple-bundle.json").json())
    let uri = URI(config.get("fhirConverterUrl")).segment("convert").segment("fhir")

    let hl7Msg = await got.post(uri.toString(), {
                        username: config.get("mediator:client:id"), 
                        password: config.get("mediator:client:password"),
                        json: bundle
                      })
    return res.status(200).send(hl7Msg.body)
  } catch(error) {
    return res.status(500).json(error)
  }
  
  
  return res.status(501).send("Not implemented yet")

  
})

export default router;