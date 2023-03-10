'use strict'

import { R4 } from '@ahryman40k/ts-fhir-types'

export class LabWorkflows {
  static generateLabBundle(
    task: R4.ITask,
    patient: R4.IPatient,
    serviceRequests?: R4.IServiceRequest[],
    practitioner?: R4.IPractitioner,
    targetOrg?: R4.IOrganization,
    sourceOrg?: R4.IOrganization,
  ): R4.IBundle {
    const ipsBundle: R4.IBundle = {
      resourceType: 'Bundle',
    }

    const ipsCompositionType = {
      coding: [
        {
          system: 'http://loinc.org',
          code: '11502-2',
          display: 'Laboratory Test Document',
        },
      ],
    }

    const ipsComposition: R4.IComposition = {
      resourceType: 'Composition',
      type: ipsCompositionType,
      author: [{ display: 'SHR System' }],
      section: [
        {
          title: 'Task',
          entry: [{ reference: `Task/${task.id}` }],
        },
        {
          title: 'Patient',
          entry: [{ reference: `Patient/${patient.id}` }],
        },
      ],
    }
    if (!(serviceRequests === undefined)) {
      ipsComposition.section!.push({
        title: 'Service Requests',
        entry: serviceRequests.map(sr => ({
          reference: `ServiceRequest/${sr.id}`,
        })),
      })
    }
    ipsBundle.type = R4.BundleTypeKind._document
    ipsBundle.entry = []
    ipsBundle.entry.push(ipsComposition)
    ipsBundle.entry.push(task)
    ipsBundle.entry.push(patient)

    if (!(serviceRequests === undefined)) {
      ipsBundle.entry = ipsBundle.entry.concat(serviceRequests)
    }

    return ipsBundle
  }

  static async validateLabBundle(bundle: R4.IBundle) {
    // TODO: Validate bundle adheres to Profile

    // TODO: Validate Facility Codes

    // TODO Validate Patient Identity

    return true
  }
}
