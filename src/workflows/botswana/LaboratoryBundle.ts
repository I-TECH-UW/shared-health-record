import { R4 } from "@ahryman40k/ts-fhir-types";

// Define the type for a Transaction bundle with Task, Encounter, and Practitioner resources
interface ILaboratoryBundle extends R4.IBundle {
    type: R4.BundleTypeKind._transaction; // Make sure to only allow 'transaction' as the bundle type
    // entry: ILaboratoryBundleEntry[]; // Define the entry array using custom type
}

// // Define the type for each entry in the Transaction bundle
// interface ILaboratoryBundleEntry extends R4.IBundle_Entry {
//     resource: R4.ITask | R4.IEncounter | R4.IPractitioner; // Task, Encounter, or Practitioner
//     request: R4.IBundle_Request; // For the transaction request details
// }


class LaboratoryBundle {
    protected bundle: ILaboratoryBundle;

    constructor(bundle: ILaboratoryBundle) {
        this.bundle = bundle;
    }



    getBundle(): R4.IBundle {
        return this.bundle;
    }


<<<<<<< Updated upstream

=======
    protected async addAllCodings(labBundle: ILaboratoryBundle): Promise<ILaboratoryBundle> {
        try {
            for (const e of labBundle.entry!) {
                if (
                    e.resource &&
                    e.resource.resourceType == 'ServiceRequest' &&
                    e.resource.code &&
                    e.resource.code.coding &&
                    e.resource.code.coding.length > 0
                ) {
                    logger.info`Translating ServiceRequest Codings`

                    e.resource = await this.translateCoding(<ILaboratorye.resource)
                }
                else {
                    logger.info`No Codings to Translate`
                }
            }
        } catch (e) {
            logger.error(e)
        }
        return labBundle
    }
>>>>>>> Stashed changes
}



class PIMSLaboratoryBundle extends LaboratoryBundle {

}

class IPMSLaboratoryBundle extends LaboratoryBundle {

}
