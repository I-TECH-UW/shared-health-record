"use strict"

import { R4 } from "@ahryman40k/ts-fhir-types";
import got from "got";
import URI from "urijs";

class hl7Workflows {
  constructor() {

  }


  // GET Lab Orders via HL7v2 over HTTP - OBR Message

  // Translate a Task and associated ServiceRequests into HL7v2 (OBR)
  static translateTaskBundle(bundle: R4.IBundle) {
    // For each Task:
    // 1. grab all profile-level service requests 
    //  

  }

  // Translate a ServiceRequest hierarchy into HL7v2 (OBR)
  static translateServiceRequestBundle(bundle: R4.IBundle) {

  }

  private async processSearchBundle() {
        // Paginate through results
        let nextExists = false;
        do {
          let searchBundle: any = await got.get(URI.toString()).json()
    
          if(searchBundle.entry && searchBundle.entry.length > 0) {
            for (const serviceRequest of searchBundle.entry) {
              
            }
          }
    
    
          if (searchBundle.next) {
    
          }
        } while (nextExists);
  }
}