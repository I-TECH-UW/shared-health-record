"use strict";
import express, { Request, Response } from "express";
import URI from 'urijs';
import async from 'async';
import logger from '../lib/winston';
import config from '../lib/config';
import { invalidBundleMessage, invalidBundle } from "../lib/helpers";

export const router = express.Router();
const fhirWrapper = require('../lib/fhir')();

router.get('/', (req: Request, res: Response) => {
  return res.status(200).send(req.url);
});

router.get('/:resource/:id?', (req, res) => {
  try {
    getResource({
      req,
      noCaching: true
    }, (resourceData: any, statusCode: number) => {
      for (const index in resourceData.link) {
        if (!resourceData.link[index].url) {
          continue;
        }
        const urlArr = resourceData.link[index].url.split('fhir');
        if (urlArr.length === 2) {
          resourceData.link[index].url = '/fhir' + urlArr[1];
        }
      }
      res.status(statusCode).json(resourceData);
    });
  } catch (error) {
    return res.status(500).json(error)
  }

});

// Post a bundle of resources
router.post('/', (req, res) => {
  try {
    logger.info('Received a request to add a bundle of resources');
    const resource = req.body;

    // Verify the bundle
    if (invalidBundle(resource)) {
      return res.status(400).json(invalidBundleMessage());
    }

    if (resource.entry.length === 0) {
      return res.status(400).json(invalidBundleMessage());
    }
    fhirWrapper.saveResource(resource, (code: number, err: Error, response: Response, body: any) => {
      if (!code) {
        code = 500;
      }

      if(err) return res.status(code).send(err);

      return res.status(code).json(body);
    });
    
  } catch (error) {
    return res.status(500).json(error)
  }
});

// Create resource
router.post('/:resourceType', (req, res) => {
  saveResource(req, res);
});

// Update resource
router.put('/:resourceType/:id', (req, res) => {
  saveResource(req, res);
});


/** Helpers */

function getResource({
  req,
  noCaching
}: { req: any, noCaching: boolean }, callback: Function) {
  const resource = req.params.resource;
  const id = req.params.id;

  let uri = URI(config.get('fhirServer:baseURL'));
  logger.info('Received a request to get resource ' + resource + ' with id ' + id);

  if (resource) {
    uri = uri.segment(resource);
  }
  if (id) {
    uri = uri.segment(id);
  }
  for (const param in req.query) {
    uri.addQuery(param, req.query[param]);
  }
  let url: string = uri.toString();
  logger.info(`Getting ${url}`);

  fhirWrapper.getResource({
    url,
    noCaching
  }, (resourceData: any, statusCode: number) => {
    return callback(resourceData, statusCode);
  });
}

function saveResource(req: any, res: any) {
  let resource = req.body;
  let resourceType = req.params.resourceType;
  let id = req.params.id;
  if (id && !resource.id) {
    resource.id = id;
  }

  logger.info('Received a request to add resource type ' + resourceType);

  fhirWrapper.create(resource, (code: number, _err: any, _response: Response, body: any) => {
    return res.status(code).send(body);
  });
}

export default router;