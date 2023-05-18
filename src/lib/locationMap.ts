import * as path from 'path'
import * as Excel from 'exceljs'

type FacilityMapping = {
  index: number
  orderingFacility: string
  receivingFacility: string
  provider: string
  patientType: string
  patientStatus: string
  futurePatientStatus: string
  xLocation: string
}

const getCellValue = (row: Excel.Row, cellIndex: number) => {
  const cell = row.getCell(cellIndex)
  return cell.value ? cell.value.toString() : ''
}

async function getFacilityMappings() {
  const locationMapFile = path.resolve(__dirname, '../../config/ipms_facility_mappings.xlsx')

  const workbook = new Excel.Workbook()
  const content = await workbook.xlsx.readFile(locationMapFile)
  const worksheet = content.getWorksheet('HIE')

  const rowStartIndex = 2
  const rowEndIndex = 11

  const rows = worksheet.getRows(rowStartIndex, rowEndIndex) ?? []

  const mappings = rows.map((row: Excel.Row): FacilityMapping => {
    return {
      index: parseInt(getCellValue(row, 1)),
      orderingFacility: getCellValue(row, 2),
      receivingFacility: getCellValue(row, 3),
      provider: getCellValue(row, 5),
      patientType: getCellValue(row, 6),
      patientStatus: getCellValue(row, 7),
      futurePatientStatus: getCellValue(row, 8),
      xLocation: getCellValue(row, 9),
    }
  })

  return mappings
}

const facilityMappings = getFacilityMappings()

export default facilityMappings
