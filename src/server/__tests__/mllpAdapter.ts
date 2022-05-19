import { BundleTypeKind, IBundle } from '@ahryman40k/ts-fhir-types/lib/R4'
import { promises as fs } from 'fs'
import path from 'path'
import Hl7Workflows from '../../workflows/hl7WorkflowsBw'
import MllpAdapter from '../mllpAdapter'

describe('MllpAdapter#handleMessage', () => {
  let returnBundle: IBundle = {
    resourceType: 'Bundle',
    type: BundleTypeKind._transactionResponse,
  }
  let mllp = new MllpAdapter()
  let returnPromise: Promise<IBundle> = new Promise(resolve => {
    resolve(returnBundle)
  })
  it('should handle ADT message', async () => {
    jest.setTimeout(30000)
    let msg = (await fs.readFile(path.join(__dirname, '../../__data__/sample_ADT.txt'))).toString()

    const saveAdtMessageSpy = jest
      .spyOn(Hl7Workflows, 'handleAdtMessage')
      .mockReturnValue(returnPromise)

    //@ts-ignore
    let result: any = await mllp.handleMessage(msg)

    expect(result).toEqual(returnBundle)
    expect(saveAdtMessageSpy).toHaveBeenCalledTimes(1)

    saveAdtMessageSpy.mockRestore()
  })

  it('should handle ORU message', async () => {
    let msg = (await fs.readFile(path.join(__dirname, '../../__data__/sample_ORU.txt'))).toString()

    const saveOruMessageSpy = jest
      .spyOn(Hl7Workflows, 'handleOruMessage')
      .mockReturnValue(returnPromise)

    let result = await mllp['handleMessage'](msg)

    expect(result).toEqual(returnBundle)
    expect(saveOruMessageSpy).toHaveBeenCalledTimes(1)

    saveOruMessageSpy.mockRestore()
  })

  it('should error on other message type', async () => {
    let msg = (await fs.readFile(path.join(__dirname, '../../__data__/sample_ORM.txt'))).toString()

    let result: IBundle = await mllp['handleMessage'](msg)

    expect(result.entry).toHaveLength(1)
    expect(result.entry![0].response!.status!).toContain('501')
  })
})
