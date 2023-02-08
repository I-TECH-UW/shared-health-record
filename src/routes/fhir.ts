'use strict'
import express, { Request, Response } from 'express'
import got from 'got'
import URI from 'urijs'
import config from '../lib/config'
import { invalidBundle, invalidBundleMessage } from '../lib/helpers'
import logger from '../lib/winston'
import { generateSimpleIpsBundle } from '../workflows/ips'

export const router = express.Router()
const fhirWrapper = require('../lib/fhir')()

router.get('/', (req: Request, res: Response) => {
  return res.status(200).send(req.url)
})

router.get('/:resource/:id?/:operation?', async (req, res) => {
  let result = {}
  try {
    let uri = URI(config.get('fhirServer:baseURL'))
    uri = uri.segment(req.params.resource)

    if (req.params.id) {
      uri = uri.segment(req.params.id)
    }

    for (const param in req.query) {
      uri.addQuery(param, req.query[param])
    }

    logger.info(`Getting ${uri.toString()}`)

    let options = {
      username: config.get('fhirServer:username'),
      password: config.get('fhirServer:password')
    }

    if(req.params.id && req.params.resource == "Patient" && (req.params.id == "$summary" || req.params.operation == "$summary")) {
      // Handle IPS Generation. 
      
      if(req.params.id && req.params.id.length > 0 && req.params.id[0] != "$"){
        // ** If using logical id of the Patient object, create summary from objects directly connected to the patient. 
        result = await generateSimpleIpsBundle(req.params.id)
      } else if(req.params.id == "$summary") {
        /**
         * If not using logical id, use the Client Registry to resolve patient identity:
         * 1. Each time a Patient Object is Created or Updated, a copy is sent to the attached CR
         * 2. Assumption: The CR is set up to correctly match the Patient to other sources.
         * 3. When IPS is requested with an identifier query parameter and no logical id parameter:
         *   a. The Client Registry is queried with an $ihe-pix request to get identifiers cross-referenced with the given identifier. 
         *   b. All Patient IDs from the SHR are filtered (in query or post-process)
         *   c. Patient data is composed of multiple patient resources, the golden record resource, and all owned data
         * */
      } else {
        // Unsupported Operation
      }
      
      
    } else {
      result = await got.get(uri.toString(), options).json()
    }
    
    res.status(200).json(result)
  } catch (error) {
    return res.status(500).json(error)
  }
})

// Post a bundle of resources
router.post('/', (req, res) => {
  try {
    logger.info('Received a request to add a bundle of resources')
    const resource = req.body

    // Verify the bundle
    if (invalidBundle(resource)) {
      return res.status(400).json(invalidBundleMessage())
    }

    if (resource.entry.length === 0) {
      return res.status(400).json(invalidBundleMessage())
    }
    fhirWrapper.saveResource(
      resource,
      (code: number, err: Error, response: Response, body: any) => {
        if (!code) {
          code = 500
        }

        if (err) return res.status(code).send(err)

        return res.status(code).json(body)
      },
    )
  } catch (error) {
    return res.status(500).json(error)
  }
})

// Create resource
router.post('/:resourceType', (req, res) => {
  saveResource(req, res)
})

// Update resource
router.put('/:resourceType/:id', (req, res) => {
  saveResource(req, res)
})

/** Helpers */

function getResource({ req, noCaching }: { req: any; noCaching: boolean }, callback: Function) {
  const resource = req.params.resource
  const id = req.params.id

  let uri = URI(config.get('fhirServer:baseURL'))
  logger.info('Received a request to get resource ' + resource + ' with id ' + id)

  if (resource) {
    uri = uri.segment(resource)
  }
  if (id) {
    uri = uri.segment(id)
  }
  for (const param in req.query) {
    uri.addQuery(param, req.query[param])
  }
  let url: string = uri.toString()
  logger.info(`Getting ${url}`)

  fhirWrapper.getResource(
    {
      url,
      noCaching,
    },
    (resourceData: any, statusCode: number) => {
      return callback(resourceData, statusCode)
    },
  )
}

function saveResource(req: any, res: any) {
  let resource = req.body
  let resourceType = req.params.resourceType
  let id = req.params.id
  if (id && !resource.id) {
    resource.id = id
  }

  logger.info('Received a request to add resource type ' + resourceType)

  fhirWrapper.create(resource, (code: number, _err: any, _response: Response, body: any) => {
    return res.status(code).send(body)
  })
}

export default router
