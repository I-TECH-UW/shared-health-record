import { R4 } from '@ahryman40k/ts-fhir-types';
import got from 'got/dist/source';
import nock from 'nock';

import {getResource} from '../lab'
const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

describe('getResource', () => {
  it ('should return resource of given type', async () => {
    let resource: R4.IPatient = await got(IG_URL+"/Patient-example-laboratory-patient.json").json()

    
  }
)}
);
  