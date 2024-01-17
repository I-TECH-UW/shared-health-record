import request from 'supertest'
import express from 'express'
import { router } from '../ips'

const app = express()
app.use('/', router)

describe('IPS Routes', () => {

  it.skip('should return 200 OK for GET /metadata', async () => {
    
    
    const response = await request(app).get('/metadata')

    expect(response.status).toBe(200)
  })
})