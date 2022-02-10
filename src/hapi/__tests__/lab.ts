import { R4 } from '@ahryman40k/ts-fhir-types'
import { BundleTypeKind } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got/dist/source'
import nock from 'nock'
import { config } from '../../lib/config'
import { getResource, saveLabBundle, translateToTransactionBundle } from '../lab'

const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

let fhirUrl: string = config.get('fhirServer:baseURL')

describe('saveLabBundle', () => {
  it('should save a a document bundle', async () => {
    // Load data
    let transactionBundle: R4.IBundle = await got(
      IG_URL + '/Bundle-example-laboratory-simple-bundle-transaction.json',
    ).json()
    let transactionResultBundle: R4.IBundle = await got(
      IG_URL + '/Bundle-example-transaction-response-bundle.json',
    ).json()

    // Mock server
    const scope = nock(fhirUrl)
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

    let result = await saveLabBundle(transactionBundle)

    expect(result).toEqual(transactionResultBundle)
  })
})

describe(translateToTransactionBundle, () => {
  it('should translate document bundle to transaction bundle', async () => {
    let docBundle: R4.IBundle = await got(
      IG_URL + '/Bundle-example-laboratory-simple-bundle.json',
    ).json()

    let result = translateToTransactionBundle(docBundle)

    expect(result.type).toEqual(BundleTypeKind._transaction)
  })
})
describe('getResource', () => {
  it('should return resource of given type', async () => {
    let resource: R4.IPatient = await got(
      IG_URL + '/Patient-example-laboratory-patient.json',
    ).json()
    let type: string = 'Patient'
    let id: string = resource.id!

    const scope = nock(fhirUrl).get(`/${type}/${id}`).once().reply(200, resource)

    let result: R4.IPatient = await getResource(type, id)

    expect(result).toEqual(resource)
  })
})
