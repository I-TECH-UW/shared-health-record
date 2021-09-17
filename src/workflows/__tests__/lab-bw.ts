import { LaboratoryWorkflowsBw } from '../lab-bw'
import { R4 } from '@ahryman40k/ts-fhir-types'
import got from 'got'
import logger from '../../lib/winston'
const IG_URL = 'https://b-techbw.github.io/bw-lab-ig'

let patient: R4.IPatient

jest.mock("fhirclient/lib/Client");

beforeAll(async () => {
  patient = await got(IG_URL+"/Patient-example-laboratory-patient.json").json()
});

describe('translatePimsCoding', () => {
  it('should translate a given lab test PIMS coding to ciel, loinc, and IPMS', () => {
    let getServiceRequest = got(IG_URL+"/ServiceRequest-example-laboratory-service-request.json").json()

  });
});