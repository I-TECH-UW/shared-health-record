import { R4 } from '@ahryman40k/ts-fhir-types'
import got from 'got'
import { LabWorkflowsBw } from '../labWorkflowsBw'
const IG_URL = 'https://b-techbw.github.io/bw-lab-ig'

let patient: R4.IPatient

jest.mock('fhirclient/lib/Client')

describe('translatePimsCoding', () => {
  it('should translate a given lab test PIMS coding to ciel, loinc, and IPMS', async () => {
    let serviceRequest = <R4.IServiceRequest>(
      await got.get(IG_URL + '/ServiceRequest-example-bw-pims-service-request-1.json').json()
    )

    serviceRequest.code!.coding![0].code! = '3'
    let result = await LabWorkflowsBw.translatePimsCoding(serviceRequest)

    expect(result).toBeDefined
  })
})

describe('getTaskStatus', () => {
  it('should get a Task status from a Bundle', async () => {
    let bundle = <R4.IBundle>await got.get(IG_URL + '/Bundle-example-bw-lab-bundle.json').json()

    // @ts-ignore
    let result: R4.TaskStatusKind = LabWorkflowsBw.getTaskStatus(bundle)

    expect(result).toEqual(R4.TaskStatusKind._requested)
  })
})
