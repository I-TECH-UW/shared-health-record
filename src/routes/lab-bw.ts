'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import express, { Request, Response } from 'express'
import { saveLabBundle } from '../hapi/lab'
import { invalidBundle, invalidBundleMessage } from '../lib/helpers'
import logger from '../lib/winston'
import { LabWorkflowsBw } from '../workflows/labWorkflowsBw'

export const router = express.Router()

router.all('/', async (req: Request, res: Response) => {
  if (req.method == 'POST' || req.method == 'PUT') {
    try {
      logger.info('Received a Lab Order bundle to save.')
      let orderBundle: R4.IBundle = req.body

      // Validate Bundle
      if (invalidBundle(orderBundle)) {
        return res.status(400).json(invalidBundleMessage())
      }

      // Save Bundle
      let resultBundle: R4.IBundle = await saveLabBundle(orderBundle)

      // Trigger Background Tasks
      LabWorkflowsBw.handleBwLabOrder(orderBundle, resultBundle)

      return res.status(200).json(resultBundle)
    } catch (e) {
      return res.status(500).send(e)
    }
  }
})

// Get list of active orders targetting :facility
router.get('/orders/target/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
  return res.status(200).send(req.url)
})

// Get
router.get('/orders/source/:facilityId/:_lastUpdated?', (req: Request, res: Response) => {
  return res.status(200).send(req.url)
})

export default router
