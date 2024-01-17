import request from 'supertest'
import express from 'express'
import { router } from '../fhir'

const app = express()
app.use('/', router)

describe('FHIR Routes', () => {
  it('should return 200 OK for GET /', async () => {
    const response = await request(app).get('/')
    expect(response.status).toBe(200)
    expect(response.text).toBe('/')
  })

  it('should return 200 OK for GET /metadata', async () => {
    const response = await request(app).get('/metadata')
    expect(response.status).toBe(200)
    // Add more assertions for the response body if needed
  })

  it('should return 400 Bad Request for GET with invalid resource type', async () => {
    const response = await request(app).get('/invalid-resource')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid resource type invalid-resource' })
  })

  // Add more test cases for other routes and scenarios
})