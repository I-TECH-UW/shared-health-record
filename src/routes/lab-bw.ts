"use strict"

import express, { Request, Response } from "express"
import logger from '../lib/winston'
import { R4 } from '@ahryman40k/ts-fhir-types'
import config from '../lib/config'
import { invalidBundleMessage, invalidBundle } from "../lib/helpers"
import { saveLabBundle } from "../hapi/lab"
import { LaboratoryWorkflowsBw } from "../workflows/lab-bw"

export const router = express.Router()

router.all('/', async (req: Request, res: Response) => {
  if(req.method == "POST" || req.method == "PUT") {
    try {
      logger.info('Received a Lab Order bundle to save.')
      let orderBundle: R4.IBundle = req.body
    
      // Validate Bundle
      if (invalidBundle(orderBundle)) {
        return res.status(400).json(invalidBundleMessage())
      }

      // Add BW Mappings
      orderBundle = await LaboratoryWorkflowsBw.addBwMappings(orderBundle)
      
      let resultBundle: R4.IBundle = <R4.IBundle>(await saveLabBundle(orderBundle))
      
      return res.status(200).json(resultBundle)
    } catch (e) {
      return res.status(500).send(e)
    }
    
  }
})

// Create a new lab order in SHR based on bundle 
// (https://i-tech-uw.github.io/emr-lis-ig/Bundle-example-emr-lis-bundle.html)
// router.post('/'), async (req: Request, res: Response) => {
//   logger.info('Received a Lab Order bundle to save')
//   let orderBundle: R4.IBundle = req.body

//   // Validate Bundle
//   if (invalidBundle(orderBundle)) {
//     return res.status(400).json(invalidBundleMessage())
//   }

//   let result: any = await saveLabBundle(orderBundle)
  
//   return res.status(result.statusCode).json(result.body)
// }

// Get list of active orders targetting :facility
router.get('/orders/target/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url)
})

// Get
router.get('/orders/source/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
    return res.status(200).send(req.url)
})

router.put('/orders/:id')

// // Create resource
// router.post('/orders', (req, res) => {
//     saveResource(req, res)
// })
  
// // Update resource
// router.put('/:resourceType/:id', (req, res) => {
//     saveResource(req, res)
// })
  
export default router