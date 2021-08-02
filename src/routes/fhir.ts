"use strict";
import express, {Request, Response} from "express";
import URI from 'urijs';
import async from 'async';
import logger from '../lib/winston';
import config from '../lib/config';

export const router = express.Router();
const fhirWrapper = require('../lib/fhir')();

router.get('/', (req: Request, res: Response) => {
  return res.status(200).send(req.url);
});

router.get('/:resource/:id?', (req, res) => {  
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

});

// Post a bundle of resources
router.post('/', (req, res) => {
  logger.info('Received a request to add a bundle of resources');
  const resource = req.body;
  
  // Verify that bundle
  if (!resource.resourceType ||
    (resource.resourceType && resource.resourceType !== 'Bundle') ||
    !resource.entry || (resource.entry && resource.entry.length === 0)) {
    return res.status(400).json({
      resourceType: "OperationOutcome",
      issue: [{
        severity: "error",
        code: "processing",
        diagnostics: "Invalid bundle submitted"
      }],
      response: {
        status: 400
      }
    });
  }
  
  async.parallel({
    otherResources: (callback) => {
      if(resource.entry.length === 0) {
        return callback(null, {});
      }
      fhirWrapper.create(resource, (code: number, err: Error, response: Response, body: any) => {
        return callback(null, {code, err, response, body});
      });
    }
  }, (err, results: any) => {
    let code = results.otherResources.code;
 
    if(!code) {
      code = 500;
    }

    return res.status(code).json([results.patients.body, results.patients.body]);
  });
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
}:{req: any, noCaching: boolean }, callback: Function) {
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
  if(id && !resource.id) {
    resource.id = id;
  }

  logger.info('Received a request to add resource type ' + resourceType);

  if(resourceType === 'Patient') {
    
  }

  fhirWrapper.create(resource, (code: number, _err: any, _response: Response, body: any) => {
    return res.status(code).send(body);
  });
}

export default router;