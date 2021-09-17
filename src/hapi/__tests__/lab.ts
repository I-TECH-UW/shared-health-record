import { R4 } from '@ahryman40k/ts-fhir-types';
import got from 'got/dist/source';
import { config } from '../../lib/config';

import nock from 'nock';
import {getResource, saveLabBundle} from '../lab'

const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

let fhirUrl: string = config.get('fhirServer:baseURL')

describe('getResource', () => {
  it ('should return resource of given type', async () => {
    let resource: R4.IPatient = await got(IG_URL+"/Patient-example-laboratory-patient.json").json()
    let type: string = "Patient"
    let id: string = resource.id!

    const scope = nock(fhirUrl).get(`/${type}/${id}`).once().reply(200, resource)

    // let result: R4.IPatient = <R4.IPatient>(await getResource(type, id))

    // expect(result).toEqual(resource)
  })
});

describe('saveLabBundle', () => {
  it('should save a a document bundle', async () => {
    // Load data
    let docBundle: R4.IBundle = await got(IG_URL+"/Bundle-example-laboratory-simple-bundle.json").json()
    let transactionBundle: R4.IBundle = await got(IG_URL+"/Bundle-example-laboratory-simple-bundle-transaction.json").json()
    let transactionResultBundle: R4.IBundle = await got(IG_URL+"/Bundle-example-transaction-response-bundle.json").json()

    // Mock server
    const scope = nock(fhirUrl)
      .post('', 
        body => (body.resourceType == "Bundle" && 
                body.type == transactionBundle.type! && 
                body.id == docBundle.id! &&
                body.entry[0].request.method == "PUT"))
      .once().reply(200, transactionResultBundle)

    let result = await saveLabBundle(docBundle)

    expect(result).toEqual(transactionResultBundle)
  });

  // it('should return 400 for invalid bundle', async () => {
  //   // Load data
  //   let docBundle: R4.IBundle = {resourceType: "Bundle"}

  //   // Mock server
  //   const scope = nock(fhirUrl)
  //     .post('', 
  //       body => (body.resourceType == "Bundle" &&
  //               body.entry[0].request.method == "PUT"))
  //     .once().reply(400)

  //   let result = await saveLabBundle(docBundle)
  //   expect(result).toEqual(400)

  // });

});

describe('getTaskBundle', () => {
  it ('Should return a Task resource with associated resources for a target facility and patient', async () => {
    // Load demo Task Bundle from IG
    
    // Mock server requests to HAPI to return demo Task Bundle
    
  })
  
});
  