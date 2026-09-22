// Mounts `extendExpressApp` on a bare express() instance instead of booting
// the full Keystone HTTP server (Admin UI + GraphQL + Next.js) — fast, and
// what most routes added to server.ts only need to know about `app`.

import express from 'express'
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { extendExpressApp } from '../../server.ts'
import { getTestContext } from '../helpers/keystone-context.ts'

describe('extendExpressApp', () => {
  it('responds to GET /healthz', async () => {
    const app = express()
    extendExpressApp(app, getTestContext())

    const response = await request(app).get('/healthz')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
