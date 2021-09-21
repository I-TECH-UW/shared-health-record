import { R4 } from '@ahryman40k/ts-fhir-types';
import got from 'got/dist/source';
import { config } from '../../lib/config';

import nock from 'nock';
import {getResource, saveLabBundle, generateIpmsResults} from '../lab'

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

    let result = await saveLabBundle(docBundle, false)

    expect(result).toEqual(transactionResultBundle)
  });

  
  it('should add example resources to lab bundle', async () => {
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

    let result = await saveLabBundle(docBundle, true)

    expect(result).toEqual(transactionResultBundle)
  });

});


describe('generateIpmsResults', () => {
  it("should add random IPMS results to bundle", async () => {
    let serviceRequest: R4.IServiceRequest = await got("https://b-techbw.github.io/bw-lab-ig/ServiceRequest-example-bw-pims-service-request-1.json").json()

    let result = generateIpmsResults(serviceRequest)

    expect(result).toHaveLength(2)
  })
})

describe('getTaskBundle', () => {
  it('Should return a Task resource with associated resources for a target facility and patient', async () => {
    // Load demo Task Bundle from IG
    
    // Mock server requests to HAPI to return demo Task Bundle
    
  })
  
});
  