import { hl7Workflows } from '../hl7'
import { R4 } from '@ahryman40k/ts-fhir-types';

import nock from 'nock';
import config from '../../lib/config';
import got from 'got/dist/source';

const IG_URL = 'https://i-tech-uw.github.io/laboratory-workflows-ig'

describe(hl7Workflows.saveOruMessage, () => {
    it('should translate and save ORU message ', async () => {
        let converterUrl = config.get("fhirConverterUrl")
        let fhirUrl = config.get('fhirServer:baseURL')

        let sampleOru = `    
        MSH|^~\&|LAB|GGC|||202106101550||ORU^R01|165293.1|D|
        PID|1|TEST0062404|GG00042482^^^^MR^GGC~GG5714^^^^PI^GGC~TEST0062404^^^^HUB^GGC||Murambi^Tawanda||19880616|M||CT|Plot 1011^^Gaborone^Botswana^00267|||||M|| ZG0000044218|
        OBR|1|MOH001^LAB|68222^LAB|COVID^SARS-CoV-2 PCR^L|||202106031400|||||||202106101545||ZZHGGMMO^Healthpost^Mmopane||00049731||||||LAB|F||^^^^^R|
        OBX|1|ST|SARS-CoV-2 PCR^SARS-CoV-2 PCR^L||INCONCLUSIVE|||N||A^S|F||||GNHL^National Health Laboratory^L|
        OBX|2|ST|S-Cov-2 RVW^SARS-CoV-2 PCR REVIEW^L||.|||N||A^S|F|||202106101549|GNHL^National Health Laboratory^L|
        NTE|1|
        NTE|2|
        NTE|3||SARS-CoV-2 PCR Tests Authorised by: MEDITECH|
        NTE|4||Authorised Date: 10/06/21 1549|
    `

        let transactionBundle: R4.IBundle = await got(IG_URL + "/Bundle-example-laboratory-simple-bundle-transaction.json").json()
        let transactionResultBundle: R4.IBundle = await got(IG_URL + "/Bundle-example-transaction-response-bundle.json").json()

        // Mock Translator
        const translator = nock(converterUrl)
            .post('/convert/hl7v2/ORU_R01.hbs', sampleOru)
            .once().reply(200, {'fhirResource': transactionBundle})

        // Mock Hapi Server
        const hapi = nock(fhirUrl)
            .post('',
                body => (body.resourceType == "Bundle" &&
                    body.type == transactionBundle.type! &&
                    body.id == transactionBundle.id! &&
                    body.entry[0].request.method == "PUT"))
            .once().reply(200, transactionResultBundle)

        let result = await hl7Workflows.saveOruMessage(sampleOru)

        expect(result).toEqual(transactionResultBundle)
    })
})