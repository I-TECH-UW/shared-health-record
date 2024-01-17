import request from 'supertest'
import express from 'express'
import { router } from '../fhir'

const app = express()
app.use('/', router)

describe('FHIR Routes', () => {
  it.skip('should return 200 OK for GET /metadata', async () => {
    const response = await request(app).get('/metadata')
    expect(response.status).toBe(200)
  })

  it.skip('should return 400 Bad Request for GET with invalid resource type', async () => {
    const response = await request(app).get('/invalid-resource')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid resource type invalid-resource' })
  })

})