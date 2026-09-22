// Populates the database with demo data for local development.
// Idempotent — safe to run against a database that already has data; each
// list's seed function skips itself when rows already exist.
//
// Usage: bun run db:seed
// Options (env vars): SEED_QUANTITY (per-list count, default varies by
// list), SEED_FAKER_SEED (deterministic output for a given integer).

import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '../../generated/prisma/client.ts'
import config from '../../keystone.ts'
import seed from './seed.ts'
import { applySeedFakerSeed } from './seed.utils.ts'

applySeedFakerSeed()
const context = getContext(config, PrismaModule)

try {
  console.log('🌱 Seeding database...')
  await seed(context)
  console.log('✅ Seed complete.')
} catch (error) {
  console.error('❌ Seed failed:', error)
  process.exitCode = 1
} finally {
  await context.prisma.$disconnect()
}
