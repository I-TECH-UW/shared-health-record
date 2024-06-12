import { R4 } from '@ahryman40k/ts-fhir-types'
import { IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import got from 'got'
import logger from '../../lib/winston'
import config from '../../lib/config'
/**
 *
 * @param labBundle
 * @returns
 */
export async function mapConcepts(labBundle: IBundle): Promise<IBundle> {
  logger.info('Mapping Concepts!')

  return await addAllCodings(labBundle)
}

// Add terminology mappings info to Bundle
async function addAllCodings(labBundle: IBundle): Promise<IBundle> {
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
        e.resource = await translateCoding(e.resource)
      }
    }
  } catch (e) {
    logger.error(e)
  }
  return labBundle
}

export async function translateCoding(r: R4.IServiceRequest | R4.IDiagnosticReport): Promise<R4.IServiceRequest | R4.IDiagnosticReport> {
  let ipmsCoding, cielCoding, loincCoding, pimsCoding: any

  try {
    // Check if any codings exist
    if (r && r.code && r.code.coding && r.code.coding.length > 0) {

      // Extract PIMS and CIEL Codings, if available
      pimsCoding = getCoding(r, config.get('bwConfig:pimsSystemUrl'))
      cielCoding = getCoding(r, config.get('bwConfig:cielSystemUrl'))
      ipmsCoding = getCoding(r, config.get('bwConfig:ipmsSystemUrl'))

      logger.info(`PIMS Coding: ${JSON.stringify(pimsCoding)}`)
      logger.info(`CIEL Coding: ${JSON.stringify(cielCoding)}`)
      logger.info(`IPMS Coding: ${JSON.stringify(ipmsCoding)}`)
      
      if(ipmsCoding && ipmsCoding.code) {
        // 1. IPMS Resulting Workflow: 
        //    Translation from IPMS --> PIMS and CIEL
        pimsCoding = await getMappedCode(
          `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=PIMSLAB&fromConcept=${ipmsCoding.code}`,
        )

        if(pimsCoding && pimsCoding.code) { 
          r.code.coding.push({
            system: config.get('bwConfig:pimsSystemUrl'),
            code: pimsCoding.code,
            display: pimsCoding.display,
          })
        }

        cielCoding = await getMappedCode(
          `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCoding.code}`,
        )

        if (cielCoding && cielCoding.code) {
          r.code.coding.push({
            system: config.get('bwConfig:cielSystemUrl'),
            code: cielCoding.code,
            display: cielCoding.display,
          })
        }

      } else {
        let computedIpmsCoding
        // Lab Order Workflows
        if (pimsCoding && pimsCoding.code) {
          // 2. PIMS Order Workflow: 
          //    Translation from PIMS --> IMPS and CIEL
          computedIpmsCoding = await getIpmsCode(
            `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${pimsCoding.code}&toConceptSource=PIMSLAB`,
            pimsCoding.code,
          )

          if (computedIpmsCoding && computedIpmsCoding.code) {
            cielCoding = await getMappedCode(
              `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=CIEL&fromConcept=${computedIpmsCoding.code}`,
            )
          }

          if (cielCoding && cielCoding.code) {
            r.code.coding.push({
              system: config.get('bwConfig:cielSystemUrl'),
              code: cielCoding.code,
              display: cielCoding.display,
            })
          }
        } else if (cielCoding && cielCoding.code) {
          // 3. OpenMRS Order Workflow: 
          //    Translation from CIEL to IPMS
          computedIpmsCoding = await getIpmsCode(
            `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${cielCoding.code}&toConceptSource=CIEL`,
            cielCoding.code,
          )
        }

        // Add IPMS Coding if found successfully
        if (computedIpmsCoding && computedIpmsCoding.code) {
          const ipmsOrderTypeExt = {
            url: config.get('bwConfig:ipmsOrderTypeSystemUrl'),
            valueString: computedIpmsCoding.hl7Flag,
          }

          const srCoding = {
            system: config.get('bwConfig:ipmsSystemUrl'),
            code: computedIpmsCoding.mnemonic,
            display: computedIpmsCoding.display,
            extension: [ipmsOrderTypeExt],
          }

          r.code.coding.push(srCoding)
        }
      }

      return r
    } else {
      logger.error('Could not any codings to translate in:\n' + JSON.stringify(r))
      return r
    }
  } catch (e) {
    logger.error(`Error whil translating ServiceRequest codings: \n ${JSON.stringify(e)}`)
    return r
  }
}

async function getIpmsCode(q: string, c = '') {
  try {
    const ipmsMappings = await getOclMapping(q)

    //logger.info(`IPMS Mappings: ${JSON.stringify(ipmsMappings)}`)

    // Prioritize "Broader Than Mappings"
    //TODO: Figure out if this is proper way to handle panels / broad to narrow
    let mappingIndex = ipmsMappings.findIndex(
      (x: any) => x.map_type == 'BROADER-THAN' && x.to_concept_code == c,
    )

    // Fall back to "SAME AS"
    if (mappingIndex < 0) {
      mappingIndex = ipmsMappings.findIndex(
        (x: any) => x.map_type == 'SAME-AS' && x.to_concept_code == c,
      )
    }

    if (mappingIndex >= 0) {
      const ipmsCode = ipmsMappings[mappingIndex].from_concept_code
      const ipmsDisplay = ipmsMappings[mappingIndex].from_concept_name_resolved
      const ipmsCodingInfo: any = await getOclMapping(
        `/orgs/I-TECH-UW/sources/IPMSLAB/concepts/${ipmsCode}`,
      )
      // logger.info(`IPMS Coding Info: ${JSON.stringify(ipmsCodingInfo)}`)
      let ipmsMnemonic, hl7Flag
      if (ipmsCodingInfo) {
        ipmsMnemonic = ipmsCodingInfo.names.find((x: any) => x.name_type == 'Short').name
        hl7Flag =
          ipmsCodingInfo.extras && ipmsCodingInfo.extras.IPMS_HL7_ORM_TYPE
            ? ipmsCodingInfo.extras.IPMS_HL7_ORM_TYPE
            : 'LAB'
      }

      return { code: ipmsCode, display: ipmsDisplay, mnemonic: ipmsMnemonic, hl7Flag: hl7Flag }
    } else {
      return null
    }
  } catch (e) {
    logger.error(e)
    return null
  }
}
async function getMappedCode(q: string): Promise<any> {
  try {
    const codeMapping = await getOclMapping(q)

    //logger.info(`Code Mapping: ${JSON.stringify(codeMapping)}`)

    if (codeMapping && codeMapping.length > 0) {
      return {
        code: codeMapping[0].to_concept_code,
        display: codeMapping[0].to_concept_name_resolved,
      }
    } else {
      return {}
    }
  } catch (e) {
    logger.error(e)
    return {}
  }
}

async function getOclMapping(queryString: string): Promise<any[]> {
  const options = { timeout: config.get('bwConfig:requestTimeout') | 1000 }

  logger.info(`${config.get('bwConfig:oclUrl')}${queryString}`)

  // TODO: Add retry logic
  return got.get(`${config.get('bwConfig:oclUrl')}${queryString}`, options).json()
}

async function getOclConcept(conceptCode: string): Promise<any> {
  const options = { timeout: config.get('bwConfig:requestTimeout') | 1000 }

  // TODO: Add retry logic
  return got
    .get(
      `${config.get('bwConfig:oclUrl')}/orgs/I-TECH-UW/sources/IPMSLAB/concepts/${conceptCode}`,
      options,
    )
    .json()
}

function getCoding(r: R4.IServiceRequest | R4.IDiagnosticReport, system: string): R4.ICoding {
  if (r.code && r.code.coding) {
    return <R4.ICoding>r.code.coding.find(e => e.system && e.system == system)
  } else {
    return {}
  }
}
