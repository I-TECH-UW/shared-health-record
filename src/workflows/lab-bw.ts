"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import { getTaskBundle } from "../hapi/lab";
import { LaboratoryWorkflows } from "./lab";

export class LaboratoryWorkflowsBw extends LaboratoryWorkflows {
  static saveLabBundle(bundle: R4.IBundle) {


  }

  static generateLabBundle(task: R4.ITask, patient: R4.IPatient, serviceRequests?: R4.IServiceRequest[],
    practitioner?: R4.IPractitioner, targetOrg?: R4.IOrganization, sourceOrg?: R4.IOrganization): R4.IBundle {
      return super.generateLabBundle(task, patient, serviceRequests, practitioner, targetOrg, sourceOrg)
  }

  // Translate a Task Search Result Bundle into a Lab Doc Bundle
  static translateTaskBundle(taskBundle: R4.IBundle): R4.IBundle {
    return {resourceType: "Bundle"};
  }
}