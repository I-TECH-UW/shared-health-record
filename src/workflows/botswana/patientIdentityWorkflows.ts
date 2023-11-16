import { R4 } from '@ahryman40k/ts-fhir-types'
import config from '../../lib/config'
import { postWithRetry } from './helpers'
import logger from '../../lib/winston'

/**
 * updateCrPatient
 * @param labBundle
 * @returns
 */
export async function updateCrPatient(bundle: R4.IBundle): Promise<R4.IBundle> {
  const crUrl = `${config.get('clientRegistryUrl')}/Patient`
  let pat: R4.IPatient

  const patResult = bundle.entry!.find(entry => {
    return entry.resource && entry.resource.resourceType === 'Patient'
  })

  const options = {
    timeout: config.get('bwConfig:requestTimeout'),
    username: config.get('mediator:client:username'),
    password: config.get('mediator:client:password'),
    json: {},
  }

  if (patResult) {
    pat = <R4.IPatient>patResult.resource!
    options.json = pat
  }

  const crResult = await postWithRetry(
    crUrl,
    options,
    config.get('bwConfig:retryCount'),
    config.get('bwConfig:retryDelay'),
  )

  logger.debug(`CR Patient Update Result: ${JSON.stringify(crResult)}`)

  return bundle
}

/**
 *
 * @param labBundle
 * @returns
 */
export async function savePimsPatient(labBundle: R4.IBundle): Promise<R4.IBundle> {
  const resultBundle = updateCrPatient(labBundle)

  return resultBundle
}

/**
 *
 * @param labBundle
 * @returns
 */
export async function saveIpmsPatient(registrationBundle: R4.IBundle): Promise<R4.IBundle> {
  // Save to CR
  const resultBundle = updateCrPatient(registrationBundle)

  return resultBundle
}
