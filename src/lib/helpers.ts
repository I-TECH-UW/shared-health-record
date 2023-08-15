'use strict'

export function invalidBundle(resource: any): boolean {
  return (
    !resource.resourceType ||
    (resource.resourceType && resource.resourceType !== 'Bundle') ||
    !resource.entry ||
    (resource.entry && resource.entry.length === 0)
  )
}

export function invalidBundleMessage(): any {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'processing',
        diagnostics: 'Invalid bundle submitted',
      },
    ],
    response: {
      status: 400,
    },
  }
}

// export function getFromFhirServer(resourcePath, )
// <R4.IBundle>await got
//       .get(
//         `${config.get('fhirServer:baseURL')}/Patient?_id=${patientId}&_include=*&_revinclude=*`,
//         {
//           username: config.get('fhirServer:username'),
//           password: config.get('fhirServer:password'),
//         },
//       )
//       .json()
