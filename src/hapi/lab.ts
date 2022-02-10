'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'
import { BundleTypeKind } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got/dist/source'
import URI from 'urijs'
import config from '../lib/config'
import util = require('util')

import logger = require('../lib/winston')

const fhirWrapper = require('../lib/fhir')()

let uri = URI(config.get('fhirServer:baseURL'))

// TODO: change source utils to use got() & await pattern
// Promisify fns
let create = util.promisify(fhirWrapper.create)
let get = util.promisify(fhirWrapper.getResource)

// const mpiClient = fhirClient(req, res).client({ serverUrl: mpiUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});
// const shrClient = fhirClient(req, res).client({ serverUrl: shrUrl, username: config.get('fhirServer:username'), password: config.get('fhirServer:password')});

export async function getResource(type: string, id: string, params?: any, noCaching?: boolean) {
  // return got.get(`${SHR_URL}/${type}/${id}`).json()
  let resourceData: any, statusCode: number

  noCaching = noCaching === undefined ? true : noCaching

  logger.info('Received a request to get resource of type' + type + ' with id ' + id)

  if (type) {
    uri = uri.segment(type)
  }
  if (id) {
    uri = uri.segment(id)
  }
  if (params && params.length > 0) {
    for (const param in params) {
      uri.addQuery(param, params[param])
    }
  }
  let url: string = uri.toString()

  logger.info(`Getting ${url}`)

  try {
    resourceData = await got({ url: url }).json()
  } catch (error: any) {
    logger.error(`Could not retrieve resource: ${error.response.body}`)
    resourceData = null
  }

  return resourceData
}

// TODO
export async function saveResource() {}

export async function getTaskBundle(patientId: string, locationId: string) {
  logger.info(`Getting Bundle for patient ${patientId} and location ${locationId}`)

  let requestUri = uri
    .segment('Task')
    .addQuery('patient', patientId)
    .addQuery('owner', locationId)
    .addQuery('_include', '*')
    .addQuery('_revinclude', '*')

  // Get Task and Associated Resources
  return got.get(uri.toString()).json()
}

export async function saveLabBundle(bundle: R4.IBundle): Promise<R4.IBundle> {
  logger.info(`Posting ${bundle.resourceType} to ${uri.toString()}`)

  if (!bundle.type || bundle.type != BundleTypeKind._transaction) {
    bundle = translateToTransactionBundle(bundle)
  }
  try {
    let ret = await got.post(uri.toString(), { json: bundle }).json()

    return <R4.IBundle>ret
  } catch (error: any) {
    return {
      resourceType: 'Bundle',
      type: BundleTypeKind._transactionResponse,
      entry: [
        {
          response: {
            status: `${<Error>error.message}`,
          },
        },
      ],
    }
  }
}

export function translateToTransactionBundle(bundle: R4.IBundle): R4.IBundle {
  if (bundle.type && bundle.type == BundleTypeKind._transaction) {
    logger.info('Bundle already has transaction type.')
  } else {
    bundle.type = R4.BundleTypeKind._transaction
    bundle.link = [
      {
        relation: 'self',
        url: 'responding.server.org/fhir',
      },
    ]

    if (bundle.entry) {
      for (let entry of bundle.entry) {
        if (entry.resource) {
          let resource = entry.resource
          entry.request = {
            method: R4.Bundle_RequestMethodKind._put,
            url: `${resource.resourceType}/${resource.id}`,
          }
        }
      }
    }
  }

  return bundle
}
