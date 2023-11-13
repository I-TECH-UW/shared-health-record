
// class LaboratoryServiceRequest {
//     protected serviceRequest: R4.IServiceRequest;

//     constructor(serviceRequest: R4.IServiceRequest) {
//         this.serviceRequest = serviceRequest;
//     }

// protected async translateCoding(): Promise<R4.IServiceRequest> {
//     let ipmsCoding, cielCoding, loincCoding, pimsCoding

// try {
//   if (serviceRequest && serviceRequest.code && serviceRequest.code.coding && serviceRequest.code.coding.length > 0) {
//     pimsCoding = this.getCoding(serviceRequest, config.get('bwConfig:pimsSystemUrl'))
//     cielCoding = this.getCoding(serviceRequest, config.get('bwConfig:cielSystemUrl'))

//     logger.info(`PIMS Coding: ${JSON.stringify(pimsCoding)}`)
//     logger.info(`CIEL Coding: ${JSON.stringify(cielCoding)}`)

//     if (pimsCoding && pimsCoding.code) {
//       // Translate from PIMS to CIEL and IPMS
//       ipmsCoding = await this.getIpmsCode(
//         `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${pimsCoding.code}&toConceptSource=PIMSLAB`,
//         pimsCoding.code,
//       )

//       if (ipmsCoding && ipmsCoding.code) {
//         cielCoding = await this.getMappedCode(
//           `/orgs/I-TECH-UW/sources/IPMSLAB/mappings/?toConceptSource=CIEL&fromConcept=${ipmsCoding.code}`,
//         )
//       }

//       if (cielCoding && cielCoding.code) {
//         serviceRequest.code.coding.push({
//           system: config.get('bwConfig:cielSystemUrl'),
//           code: cielCoding.code,
//           display: cielCoding.display,
//         })
//       }
//     } else if (cielCoding && cielCoding.code) {
//       // Translate from CIEL to IPMS
//       ipmsCoding = await this.getIpmsCode(
//         `/orgs/I-TECH-UW/sources/IPMSLAB/mappings?toConcept=${cielCoding.code}&toConceptSource=CIEL`,
//         cielCoding.code,
//       )
//     }

//     // Add IPMS Coding
//     if (ipmsCoding && ipmsCoding.code) {
//       const ipmsOrderTypeExt = {
//         url: config.get('bwConfig:ipmsOrderTypeSystemUrl'),
//         valueString: ipmsCoding.hl7Flag,
//       }

//       const srCoding = {
//         system: config.get('bwConfig:ipmsSystemUrl'),
//         code: ipmsCoding.mnemonic,
//         display: ipmsCoding.display,
//         extension: [ipmsOrderTypeExt],
//       }

//       serviceRequest.code.coding.push(srCoding)
//     }

//     // Get LOINC Coding
//     if (cielCoding && cielCoding.code) {
//       loincCoding = await this.getMappedCode(
//         `/orgs/CIEL/sources/CIEL/mappings/?toConceptSource=LOINC&fromConcept=${cielCoding.code}`,
//       )
//       if (loincCoding && loincCoding.code) {
//         serviceRequest.code.coding.push({
//           system: config.get('bwConfig:loincSystemUrl'),
//           code: loincCoding.code,
//           display: loincCoding.display,
//         })
//       }
//     }

//     return serviceRequest
//   } else {
//     logger.error('Could not find coding to translate in:\n' + JSON.stringify(serviceRequest))
//     return serviceRequest
//   }
// } catch (e) {
//   logger.error(`Could not translate ServiceRequest codings: \n ${e}`)
//   return serviceRequest
// }

//     return ServiceRequest;
// }
