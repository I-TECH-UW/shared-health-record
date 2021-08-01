import {generateLabBundle} from '../lab'
import { R4 } from '@ahryman40k/ts-fhir-types'
import got from 'got'
import logger from '../../lib/winston'
const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'
let patient: R4.IPatient

jest.mock("fhirclient/lib/Client");

describe('generateLabBundle', () => {
  it ('should return a Document Bundle with the correct type', async () => {
    console.log(`${IG_URL}/Task-example-laboratory-task-simple-requested.json`)
    let task: R4.ITask = await got(IG_URL+"/Task-example-laboratory-task-simple-requested.json").json();

    let result: R4.IBundle = generateLabBundle(task, patient)

    expect(result.resourceType!).toEqual("Bundle")
    expect(result.type!).toEqual(R4.BundleTypeKind._document)
  }),
  
  it ('should return expected Document bundle given example data', async () => {
    // Load Example Data
    patient = await got(IG_URL+"/Patient-example-laboratory-patient.json").json()

    let getBundle  = await got(IG_URL+"/Bundle-example-laboratory-simple-bundle.json").json()
    let getTask = await got(IG_URL+"/Task-example-laboratory-task-simple-requested.json").json()
    let getServiceRequest = await got(IG_URL+"/ServiceRequest-example-laboratory-service-request.json").json()
    let getPractitioner = await got(IG_URL+"/Practitioner-example-laboratory-practitioner.json").json()
    
    let [exampleBundle, task, serviceRequest, practitioner] = 
      await Promise.all([getBundle, getTask, getServiceRequest, getPractitioner])
    
    let result = generateLabBundle(<R4.ITask> task, patient, 
                                  [(<R4.IServiceRequest> serviceRequest)], 
                                  <R4.IPractitioner> practitioner);

    expect(result).toEqual(exampleBundle)
  })
})