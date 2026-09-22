// Gives integration tests a real Keystone context — no HTTP server, no mocks —
// backed by the same sqlite db this starter's `keystone dev` already pushes
// its schema to. Tests import from here so `getContext` isn't re-wired in
// every test file.
// see https://keystonejs.com/docs/guides/testing
//
// This starter uses `db push` (not `prisma migrate`) for the fastest dev
// startup, so `@keystone-6/core/testing/sqlite`'s `resetDatabase` — which
// replays migration files — doesn't apply here. Each test is responsible for
// cleaning up the rows it creates (see tests/integration/schema.test.ts).

import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '../../generated/prisma/client.ts'
import type { KeystoneContext } from '@keystone-6/core/types'
import config from '../../keystone.ts'

let cachedContext: KeystoneContext | undefined

export function getTestContext(): KeystoneContext {
  cachedContext ??= getContext(config, PrismaModule)
  return cachedContext
}
