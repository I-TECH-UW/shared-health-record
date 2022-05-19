import { R4 } from '@ahryman40k/ts-fhir-types'
import { promises as fs } from 'fs'
import got from 'got/dist/source'
import nock from 'nock'
import path from 'path'
import config from '../../lib/config'
import Hl7WorkflowsBw from '../hl7WorkflowsBw'

const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

describe(Hl7WorkflowsBw.handleOruMessage, () => {
  it('should translate and save ORU message ', async () => {
    let converterUrl = config.get('fhirConverterUrl')
    let fhirUrl = config.get('fhirServer:baseURL')

    let sampleOru = (
      await fs.readFile(path.join(__dirname, '../../__data__/sample_ORU.txt'))
    ).toString()

    let transactionBundle: R4.IBundle = await got(
      IG_URL + '/Bundle-example-laboratory-simple-bundle-transaction.json',
    ).json()
    let transactionResultBundle: R4.IBundle = await got(
      IG_URL + '/Bundle-example-transaction-response-bundle.json',
    ).json()

    // Mock Translator
    const translator = nock(converterUrl)
      .post('/convert/hl7v2/ORU_R01.hbs', sampleOru)
      .once()
      .reply(200, { fhirResource: transactionBundle })

    // Mock Hapi Server
    const hapi = nock(fhirUrl)
      .post(
        '',
        body =>
          body.resourceType == 'Bundle' &&
          body.type == transactionBundle.type! &&
          body.id == transactionBundle.id! &&
          body.entry[0].request.method == 'PUT',
      )
      .once()
      .reply(200, transactionResultBundle)

    let result = await Hl7WorkflowsBw.handleOruMessage(sampleOru)

    expect(result).toEqual(transactionResultBundle)
  })
})
