import { R4 } from '@ahryman40k/ts-fhir-types'
import { MllpServer } from '@i-tech-uw/mllp-server'
import got from 'got'
import nock from 'nock'
import config from '../../lib/config'
import { LabWorkflowsBw } from '../labWorkflowsBw'
const IG_URL = 'https://b-techbw.github.io/bw-lab-ig'

let patient: R4.IPatient

var fs = require('fs')

describe('lab Workflows for Botswana should', () => {
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

  describe('setTaskStatus', () => {
    it('should set a Task status in a Bundle', async () => {
      let bundle = <R4.IBundle>await got.get(IG_URL + '/Bundle-example-bw-lab-bundle.json').json()

      let status = R4.TaskStatusKind._accepted

      // @ts-ignore
      let result: R4.IBundle = LabWorkflowsBw.setTaskStatus(bundle, status)

      // @ts-ignore
      expect(LabWorkflowsBw.getTaskStatus(result)).toEqual(status)
    })
  })

  describe('use MLLP sender to', () => {
    let hl7: string = ''
    let server: MllpServer

    beforeAll((done: () => void) => {
      jest.setTimeout(1000000)
      server = new MllpServer('127.0.0.1', 2100)
      server.listen()

      hl7 = fs.readFileSync('./src/__data__/sample_ADT.txt').toString().split('\n').join('\r')

      // Mock translation service
      const scope = nock(config.get('fhirConverterUrl')).post(/.*/).reply(200, hl7)

      done()
    })

    afterAll(done => {
      server.close(done)
    })

    describe('sendAdtToIpms', () => {
      it('and translate and send `requested` Order Bundle', async () => {
        jest.setTimeout(100000)
        let bundle = <R4.IBundle>await got.get(IG_URL + '/Bundle-example-bw-lab-bundle.json').json()

        // let result: R4.IBundle = await LabWorkflowsBw.sendAdtToIpms(bundle)

        // expect(JSON.stringify(result)).toContain(R4.TaskStatusKind._accepted)
      })

      it('should not send order without `requested` status', async () => {
        let bundle = <R4.IBundle>await got.get(IG_URL + '/Bundle-example-bw-lab-bundle.json').json()

        let taskIndex = bundle.entry?.findIndex(
          e => e.resource && e.resource.resourceType == 'Task',
        )
        if (bundle.entry && taskIndex != undefined) {
          ;(<R4.ITask>bundle.entry[taskIndex].resource!).status = R4.TaskStatusKind._draft
        }

        let result: R4.IBundle = await LabWorkflowsBw.sendAdtToIpms(bundle)
      })
    })
  })
})
