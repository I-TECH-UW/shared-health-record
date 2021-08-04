"use strict";

export function invalidBundle(resource: any): Boolean { 
  return !resource.resourceType ||
  (resource.resourceType && resource.resourceType !== 'Bundle') ||
  !resource.entry || (resource.entry && resource.entry.length === 0)
}   

export function invalidBundleMessage(): any {
  return {
    resourceType: "OperationOutcome",
    issue: [{
      severity: "error",
      code: "processing",
      diagnostics: "Invalid bundle submitted"
    }],
    response: {
      status: 400
    }
  }
}