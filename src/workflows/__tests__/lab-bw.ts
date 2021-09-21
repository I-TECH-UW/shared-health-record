import { LaboratoryWorkflowsBw } from '../lab-bw'
import { R4 } from '@ahryman40k/ts-fhir-types'
import got from 'got'
import logger from '../../lib/winston'
const IG_URL = 'https://b-techbw.github.io/bw-lab-ig'

let patient: R4.IPatient

jest.mock("fhirclient/lib/Client");

describe('translatePimsCoding', () => {
  it('should translate a given lab test PIMS coding to ciel, loinc, and IPMS', async () => {
    let serviceRequest = <R4.IServiceRequest> (await got.get(IG_URL+"/ServiceRequest-example-bw-pims-service-request-1.json").json())
    
    let result = await LaboratoryWorkflowsBw.translatePimsCoding(serviceRequest)
    
    expect(result).toBeDefined
  });
});