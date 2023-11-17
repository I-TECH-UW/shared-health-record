import { R4 } from '@ahryman40k/ts-fhir-types'
import logger from '../../lib/winston'
import got, { HTTPError, OptionsOfTextResponseBody, RequestError } from 'got'

export function getTaskStatus(labBundle: R4.IBundle): R4.TaskStatusKind | undefined {
  let taskResult, task

  try {
    taskResult = labBundle.entry!.find(entry => {
      return entry.resource && entry.resource.resourceType == 'Task'
    })

    if (taskResult) {
      task = <R4.ITask>taskResult.resource!

      return task.status!
    }
  } catch (error) {
    logger.error(`Could not get Task status for task:\n${task}`)
    return undefined
  }
}

export function setTaskStatus(labBundle: R4.IBundle, status: R4.TaskStatusKind): R4.IBundle {
  let taskIndex, task

  try {
    taskIndex = labBundle.entry!.findIndex(entry => {
      return entry.resource && entry.resource.resourceType == 'Task'
    })

    if (labBundle.entry && labBundle.entry.length > 0 && taskIndex >= 0) {
      (<R4.ITask>labBundle.entry[taskIndex].resource!).status = status
    }
    return labBundle
  } catch (error) {
    logger.error(`Could not get Task status for task:\n${task}`)
    return labBundle
  }
}

export function getBundleEntry(
  entries: R4.IBundle_Entry[],
  type: string,
  id?: string,
): R4.IResource | undefined {
  const entry = entries.find(entry => {
    return entry.resource && entry.resource.resourceType == type && (!id || entry.resource.id == id)
  })

  return entry?.resource
}

export function getBundleEntries(
  entries: R4.IBundle_Entry[],
  type: string,
  id?: string,
): (R4.IResource | undefined)[] {
  return entries
    .filter(entry => {
      return (
        entry.resource && entry.resource.resourceType == type && (!id || entry.resource.id == id)
      )
    })
    .map(entry => {
      return entry.resource
    })
}

// Wrapper function that includes retry logic
export async function postWithRetry(
  crUrl: string,
  options: OptionsOfTextResponseBody,
  retryLimit = 2,
  timeout = 30000,
) {
  for (let attempt = 1; attempt <= retryLimit; attempt++) {
    try {
      const response = await got.post(crUrl, options).json()
      return response // If request is successful, return the response
    } catch (error) {
      logger.error(`Attempt ${attempt} failed`)

      // Sleep for a given amount of time
      await new Promise(resolve => setTimeout(resolve, timeout))

      if (error instanceof HTTPError) {
        // Handle HTTP errors (4xx and 5xx response codes)
        console.error(`HTTP Error: ${error.response.statusCode}`)
      } else if (error instanceof RequestError) {
        // Handle network errors or other request issues
        console.error(`Request Error: ${error.message}`)
      } else {
        // Handle any other errors that might occur
        console.error(`Unknown Error: ${error}`)
      }

      // If we are on the last attempt, re-throw the error
      if (attempt === retryLimit) {
        console.error('All retries failed')
        throw error
      }
    }
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
