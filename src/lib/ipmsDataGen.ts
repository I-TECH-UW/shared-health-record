import { R4 } from '@ahryman40k/ts-fhir-types'
import { v4 as uuidv4 } from 'uuid'

export class IpmsDataGen {
  static generateIpmsResults(entries: R4.IBundle_Entry[]): R4.IBundle_Entry[] {
    let generatedResults: R4.IBundle_Entry[] = []

    for (const entry of entries) {
      const resource = entry.resource
      if (
        resource &&
        resource.resourceType == 'ServiceRequest' &&
        resource.basedOn &&
        resource.status! == 'active'
      ) {
        const sr = resource
        if (sr.code && sr.code.coding && sr.code.coding.length > 0) {
          if (
            sr.code.coding[0].code == '1' &&
            sr.code.coding[0].system ==
              'https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-TEST-DICT/'
          ) {
            generatedResults = generatedResults.concat(this.generateCD4Results(sr))
          }
          if (
            sr.code.coding[0].code == '3' &&
            sr.code.coding[0].system ==
              'https://api.openconceptlab.org/orgs/B-TECHBW/sources/PIMS-LAB-TEST-DICT/'
          ) {
            generatedResults = generatedResults.concat(this.generateViralLoadResults(sr))
          }
        }
      }
    }
    return entries.concat(generatedResults)
  }

  private static generateCD4Results(sr: R4.IServiceRequest): R4.IBundle_Entry[] {
    const cellCount = Math.floor(Math.random() * 40)
    const obsId = 'ipms-obs-' + uuidv4()
    const obs: R4.IObservation = {
      resourceType: 'Observation',
      id: obsId,
      code: sr.code!,
      status: R4.ObservationStatusKind._final,
      valueQuantity: {
        value: cellCount,
        unit: 'cells per microliter',
        system: 'http://hl7.org/fhir/ValueSet/ucum-units',
        code: '{cells}/uL',
      },
      interpretation: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: 'L',
            },
          ],
        },
      ],
      referenceRange: [
        {
          low: {
            value: 50,
            unit: 'cells per microliter',
            system: 'http://hl7.org/fhir/ValueSet/ucum-units',
            code: '{cells}/uL',
          },
          high: {
            value: 150,
            unit: 'cells per microliter',
            system: 'http://hl7.org/fhir/ValueSet/ucum-units',
            code: '{cells}/uL',
          },
        },
      ],
      performer: sr.performer,
      basedOn: [{ reference: 'ServiceRequest/' + sr.id }],
    }

    const dr = this.getTemplateDR(sr, obsId)

    return this.packageResults(dr, obs)
  }

  private static generateViralLoadResults(sr: R4.IServiceRequest): R4.IBundle_Entry[] {
    const viralLoad = Math.floor(Math.random() * 100000) + 50000
    const obsId = 'ipms-obs-' + uuidv4()
    const obs: R4.IObservation = {
      resourceType: 'Observation',
      id: obsId,
      code: sr.code!,
      status: R4.ObservationStatusKind._final,
      valueQuantity: {
        value: viralLoad,
        unit: 'copies per milliliter',
        system: 'http://hl7.org/fhir/ValueSet/ucum-units',
        code: '{copies}/mL',
      },
      interpretation: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: 'L',
            },
          ],
        },
      ],
      referenceRange: [
        {
          high: {
            value: 100000,
            unit: 'copies per milliliter',
            system: 'http://hl7.org/fhir/ValueSet/ucum-units',
            code: '{copies}/mL',
          },
        },
      ],
      performer: sr.performer,
      basedOn: [{ reference: 'ServiceRequest/' + sr.id }],
    }

    const dr = this.getTemplateDR(sr, obsId)

    return this.packageResults(dr, obs)
  }

  private static packageResults(
    dr: R4.IDiagnosticReport,
    obs: R4.IObservation,
  ): R4.IBundle_Entry[] {
    const resPackage: R4.IBundle_Entry[] = []

    resPackage.push({
      resource: dr,
    })

    resPackage.push({
      resource: obs,
    })

    return resPackage
  }

  private static getTemplateDR(sr: R4.IServiceRequest, obsId: string): R4.IDiagnosticReport {
    const drId = 'ipms-dr-' + uuidv4()

    return {
      id: drId,
      resourceType: 'DiagnosticReport',
      code: sr.code!,
      basedOn: [{ reference: 'ServiceRequest/' + sr.id }],
      status: R4.DiagnosticReportStatusKind._final,
      subject: sr.subject,
      result: [{ reference: 'Observation/' + obsId }],
    }
  }
}
