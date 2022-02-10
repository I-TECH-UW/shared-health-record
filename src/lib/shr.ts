import cookieParser from 'cookie-parser'
import express, { Request, Response } from 'express'
import fhirRoutes from '../routes/fhir'
import hl7Routes from '../routes/hl7'
import ipsRoutes from '../routes/ips'
import labBwRoutes from '../routes/lab-bw'

const swaggerUi = require('swagger-ui-express')
const swaggerJSDoc = require('swagger-jsdoc')

const swaggerSpec = swaggerJSDoc({
  swaggerDefinition: {
    info: {
      title: 'FHIR Converter API',
      // If changing the version update the checks in convert/hl7 and convert/hl7/:template
      version: '1.0',
    },
  },
  apis: ['./routes/*.js'],
})

/**
 * @returns {express.app}
 */
export default function shrApp() {
  const app = express()

  app.use(
    express.json({
      limit: '10Mb',
      type: ['application/fhir+json', 'application/json+fhir', 'application/json'],
    }),
  )

  app.use(express.text())

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

  app.use(cookieParser())
  app.use('/ips', ipsRoutes)
  app.use('/fhir', fhirRoutes)
  app.use('/lab', labBwRoutes)
  app.use('/hl7', hl7Routes)

  app.get('/', (req: Request, res: Response) => {
    return res.redirect('/api-docs')
  })

  return app
}
