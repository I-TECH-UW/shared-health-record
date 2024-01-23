'use strict'
import config from "../lib/config"
import { Request, Response } from "express"
import got from "got"
import logger from "../lib/winston"


export function invalidBundle(resource: any): boolean {
  return (
    !resource.resourceType ||
    (resource.resourceType && resource.resourceType !== 'Bundle') ||
    !resource.entry ||
    (resource.entry && resource.entry.length === 0)
  )
}

export function invalidBundleMessage(): any {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'processing',
        diagnostics: 'Invalid bundle submitted',
      },
    ],
    response: {
      status: 400,
    },
  }
}
export function getMetadata(): any {
  return async (req: Request, res: Response) => {
    const targetUri = config.get('fhirServer:baseURL') + '/metadata'
    logger.info(`Getting ${targetUri}`)

    const options = {
      username: config.get('fhirServer:username'),
      password: config.get('fhirServer:password'),
    }

    try {
      const result = await got.get(targetUri, options).json()
      res.status(200).json(result)
    } catch (error) {
      return res.status(500).json(error)
    }
  }
}

export function hapiPassthrough(req: Request): any {
  const requestUrl = new URL(req.url)
  const targetUri = config.get('fhirServer:baseURL') + requestUrl.pathname + requestUrl.search
  
  logger.info(`Getting ${targetUri}`)

  const options = {
    username: config.get('fhirServer:username'),
    password: config.get('fhirServer:password'),
  }

  return got(targetUri, options)
}
