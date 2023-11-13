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
      } else {
        logger.info`No Codings to Translate`
      }
    }
  } catch (e) {
    logger.error(e)
  }
  return labBundle
}

async function translateCoding(sr: R4.IServiceRequest): Promise<R4.IServiceRequest> {
  let ipmsCoding, cielCoding, loincCoding, pimsCoding

  try {
    if (sr && sr.code && sr.code.coding && sr.code.coding.length > 0) {
      pimsCoding = getCoding(sr, config.get('bwConfig:pimsSystemUrl'))
      cielCoding = getCoding(sr, config.get('bwConfig:cielSystemUrl'))

      logger.info(`PIMS Coding: ${JSON.stringify(pimsCoding)}`)
      logger.info(`CIEL Coding: ${JSON.stringify(cielCoding)}`)

      if (pimsCoding && pimsCoding.code) {
        // Translate from PIMS to CIEL and IPMS
        ipmsCoding = await getIpmsCode(
          `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${pimsCoding.code}&toConceptSource=PIMSLAB`,
          pimsCoding.code,
        )

        if (ipmsCoding && ipmsCoding.code) {
          cielCoding = await getMappedCode(
            `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCoding.code}`,
          )
        }

        if (cielCoding && cielCoding.code) {
          sr.code.coding.push({
            system: config.get('bwConfig:cielSystemUrl'),
            code: cielCoding.code,
            display: cielCoding.display,
          })
        }
      } else if (cielCoding && cielCoding.code) {
        // Translate from CIEL to IPMS
        ipmsCoding = await getIpmsCode(
          `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${cielCoding.code}&toConceptSource=CIEL`,
          cielCoding.code,
        )
      }

      // Add IPMS Coding
      if (ipmsCoding && ipmsCoding.code) {
        const ipmsOrderTypeExt = {
          url: config.get('bwConfig:ipmsOrderTypeSystemUrl'),
          valueString: ipmsCoding.hl7Flag,
        }

        const srCoding = {
          system: config.get('bwConfig:ipmsSystemUrl'),
          code: ipmsCoding.mnemonic,
          display: ipmsCoding.display,
          extension: [ipmsOrderTypeExt],
        }

        sr.code.coding.push(srCoding)
      }

      // Get LOINC Coding
      if (cielCoding && cielCoding.code) {
        loincCoding = await getMappedCode(
          `/orgs/CIEL/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCoding.code}`,
        )
        if (loincCoding && loincCoding.code) {
          sr.code.coding.push({
            system: config.get('bwConfig:loincSystemUrl'),
            code: loincCoding.code,
            display: loincCoding.display,
          })
        }
      }

      return sr
    } else {
      logger.error('Could not find coding to translate in:\n' + JSON.stringify(sr))
      return sr
    }
  } catch (e) {
    logger.error(`Could not translate ServiceRequest codings: \n ${e}`)
    return sr
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

function getCoding(sr: R4.IServiceRequest, system: string): R4.ICoding {
  if (sr.code && sr.code.coding) {
    return <R4.ICoding>sr.code.coding.find(e => e.system && e.system == system)
  } else {
    return {}
  }
}
