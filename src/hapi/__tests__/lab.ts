import { R4 } from '@ahryman40k/ts-fhir-types';
import got from 'got/dist/source';
import { config } from '../../lib/config';

import nock from 'nock';
import {getResource} from '../lab'

const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

describe('getResource', () => {
  it ('should return resource of given type', async () => {
    let resource: R4.IPatient = await got(IG_URL+"/Patient-example-laboratory-patient.json").json()
    let type: string = "Patient"
    let id: string = resource.id!
    let fhirUrl: string = config.get('fhirServer:baseURL')

    const scope = nock(fhirUrl).get(`/${type}/${id}`).once().reply(200, resource)

    let result: R4.IPatient = <R4.IPatient>(await getResource(type, id))

    expect(result).toEqual(resource)
  })
});
  