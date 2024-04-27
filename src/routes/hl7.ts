'use strict'

import express, { Request, Response } from 'express'
import { hl7Sender } from '../lib/hl7MllpSender'

export const router = express.Router()

router.post('/forward/:targetIp/:targetPort', async (req: Request, res: Response) => {
  try {
    const hl7Msg: string = req.body.trim()
    const targetIp: string = req.params.targetIp
    const targetPort = Number(req.params.targetPort)

    const ack = await hl7Sender.send(hl7Msg, targetIp, targetPort)

    res.status(200)
    res.send(ack)
  } catch (error) {
    res.status(500)
    res.send(error)
  }
})

// OUTDATED - for reference
// Save ORU message as a lab bundle
// router.post('/oru', async (req: Request, res: Response) => {
//   try {
//     let hl7Msg = req.body.trim()

//     let resultBundle: R4.IBundle = await Hl7WorkflowsBw.saveOruMessage(hl7Msg)

//     return res.status(200).json(resultBundle)

//   } catch (error) {
//     logger.error(`/oru: failed!\n${error}`)
//     return res.status(500).json(error)
//   }

// })

// // Get list of HL7 OBR messages targeted at a given facility
// //    * Translates ServiceRequests that target a given facility and are active
// router.get('/obr/list/:facilityCode', async (req: Request, res: Response) => {

//   try {
//     // Get all active ServiceRequest Profiles targeting facility with facilityCode
//     let uri = URI(config.get("fhirServer:baseUrl"))
//       .segment("ServiceRequest")
//       .addQuery('performer', req.params.facilityCode)
//       .addQuery('status', 'active')

//     uri = URI(config.get("fhirConverterUrl")).segment("convert").segment("fhir")

//     // let hl7Msg = await got.post(uri.toString(), {
//     //   username: config.get("mediator:client:id"),
//     //   password: config.get("mediator:client:password"),
//     //   json: bundle
//     // })

//     return res.status(200).send("Not Implemented Yet!")
//   } catch (error) {
//     return res.status(500).json(error)
//   }
// })

// // Get a single OBR representing a given service request.
// router.get('obr/:requestId', async (req: Request, res: Response) => {
//   return res.status(501).send("Not Implemented")
// })

export default router
