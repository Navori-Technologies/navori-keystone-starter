// Keystone runs on its own Express server under the hood.
//   this file extends that server with your own routes and middleware,
//   on top of everything Keystone's Admin UI and GraphQL API already need
// see https://keystonejs.com/docs/config/config#server
//
// Everything registered here runs BEFORE Keystone mounts the GraphQL
// endpoint (`/api/graphql` by default) and the Admin UI, so global
// middleware added here — helmet, rate limiting, the JSON size limit below —
// covers GraphQL requests too.

import express, { type Express } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { KeystoneContext } from '@keystone-6/core/types'

const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? './uploads'
const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE ?? '1mb'
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 300)

export function extendExpressApp(app: Express, _context: KeystoneContext) {
  app.use(
    helmet({
      // The Admin UI is a Next.js app with inline scripts Keystone controls,
      // not this file — a default CSP would break it. Enable with a policy
      // scoped to your own routes once you have some to protect.
      contentSecurityPolicy: false,
    }),
  )

  // Protects against large-payload DoS. GraphQL file uploads go through
  // multipart (config.server.maxFileSize), not this — it only bounds plain
  // JSON bodies, GraphQL operations included.
  app.use(express.json({ limit: MAX_JSON_SIZE, strict: true }))

  // MemoryStore by default: the limit is per-process. Fine for a single
  // instance; with more than one behind a load balancer, point this at a
  // shared store (e.g. `rate-limit-redis`) or the real limit becomes
  // (instances × RATE_LIMIT_MAX) without anyone being told.
  app.use(
    '/api/graphql',
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' })
  })

  // Serves whatever storage.ts's local driver writes — see STORAGE_DRIVER.
  // A no-op with the `s3` driver: nothing is ever written under this path.
  app.use('/uploads', express.static(LOCAL_STORAGE_DIR))
}
