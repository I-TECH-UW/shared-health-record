import { R4 } from "@ahryman40k/ts-fhir-types"
import logger from "../../lib/winston"




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
  entries: IBundle_Entry[],
  type: string,
  id?: string,
): R4.IResource | undefined {
  const entry = entries.find(entry => {
    return (
      entry.resource && entry.resource.resourceType == type && (!id || entry.resource.id == id)
    )
  })

  return entry?.resource
}

export function getBundleEntries(
  entries: IBundle_Entry[],
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