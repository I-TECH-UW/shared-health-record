import { MllpServer } from "@b-techbw/mllp";
import config from "../lib/config"
import logger from "../lib/winston"
import Hl7Workflows from '../workflows/hl7';
import { IBundle, BundleTypeKind } from '@ahryman40k/ts-fhir-types/lib/R4';

const hl7 = require('hl7')

export default class MllpAdapter {

    start(callback: Function) {
        let mllpServer = new MllpServer("0.0.0.0", config.get('app:mllpPort'), logger)

        mllpServer.listen((err: Error) => callback())

        mllpServer.on('hl7', async (data) => {
            let response: IBundle = await this.handleMessage(data)

            logger.info("HL7 Response:\n"+JSON.stringify(response))
        });
    }

    private async handleMessage(data: any): Promise<IBundle> {

        logger.info('received payload:', data);
        // Determine Message Type
        let parsed = hl7.parseString(data);
        let msgType: string = parsed[0][9][0][0];

        if(msgType == 'ADT') {
            logger.info("Handling ADT Message")
            return Hl7Workflows.saveAdtMessage(data)
        } else if (msgType == 'ORU') {
            logger.info("Handling ORU Message")
            return Hl7Workflows.saveOruMessage(data)
        } else {
            logger.error("Message unsupported!")
            return {type: BundleTypeKind._transactionResponse, resourceType: "Bundle", entry: [{response: {status: "501 Not Implemented"}}]}
        }
    }


}

