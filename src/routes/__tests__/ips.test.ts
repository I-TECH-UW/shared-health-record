import request from 'supertest'
import express from 'express'
import { router } from '../ips'

const app = express()
app.use('/', router)

describe('IPS Routes', () => {
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

  it('should return 200 OK for GET /Patient/cruid/:id/:lastUpdated?', async () => {
    const response = await request(app).get('/Patient/cruid/12345')
    expect(response.status).toBe(200)
    // Add more assertions for the response body if needed
  })

  it('should return 200 OK for GET /Patient/:id/:lastUpdated?', async () => {
    const response = await request(app).get('/Patient/67890')
    expect(response.status).toBe(200)
    // Add more assertions for the response body if needed
  })

  it('should return 200 OK for GET /:location?/:lastUpdated?', async () => {
    const response = await request(app).get('/location1')
    expect(response.status).toBe(200)
    // Add more assertions for the response body if needed
  })

  it('should return 500 Internal Server Error for GET /:location?/:lastUpdated? when golden record not found', async () => {
    const response = await request(app).get('/location2')
    expect(response.status).toBe(500)
  })

  // Add more test cases for other routes and scenarios
})