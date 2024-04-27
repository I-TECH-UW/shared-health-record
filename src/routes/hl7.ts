'use strict'

import express, { Request, Response } from 'express'
import { hl7Sender } from '../lib/hl7MllpSender'

export const router = express.Router()

router.post('/forward/:targetIp/:targetPort', async (req: Request, res: Response) => {
  try {
    const hl7Msg: string = req.body.trim()
    const targetIp: string = req.params.targetIp
    const targetPort = Number(req.params.targetPort)

    const ack = await hl7Sender.send(hl7Msg, targetIp, targetPort)

    res.status(200)
    res.send(ack)
  } catch (error) {
    res.status(500)
    res.send(error)
  }
})

export default router
