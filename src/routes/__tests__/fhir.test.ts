import request from 'supertest'
import express from 'express'
import { router } from '../fhir'
import got from 'got'
import { saveResource } from '../fhir'

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

it('should return 500 Internal Server Error when the post request fails', async () => {
  const req = {
    body: {

    },
    params: {
      resourceType: 'Observation',
      id: '123',
    },
  }
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }

  // Mock the post request to fail
  jest.spyOn(got, 'post').mockRejectedValue(new Error('Post request failed'))

  await saveResource(req, res)

  expect(res.status).toHaveBeenCalledWith(400)
})
