// Wipes the local database and recreates it empty from schema.prisma.
// Destructive and irreversible — for local development only.
//
// Usage: bun run db:nuke        (drop + recreate)
//        bun run db:nuke:seed   (drop + recreate + seed)
//
// Delegates to `prisma db push --force-reset`, which drops every table and
// pushes the schema from scratch. The Prisma CLI is called directly, not via
// `keystone prisma ...`: Keystone 8 removed that subcommand, and Prisma 7 loads
// prisma.config.ts on its own.
//
// Refuses to run unless DATABASE_URL points at a local host — a copy-pasted
// staging/prod URL in .env must never be one command away from being wiped.

import { config as loadEnv } from 'dotenv'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

loadEnv()

// `db` is the Postgres service name inside docker-compose.yml's network.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'db'])

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set.')
  process.exit(1)
}

const { hostname, port, pathname } = new URL(databaseUrl)
if (!LOCAL_HOSTS.has(hostname)) {
  console.error(`❌ Refusing to nuke non-local database host "${hostname}".`)
  process.exit(1)
}

console.log(`💣 Nuking database ${pathname.slice(1)} at ${hostname}:${port || 5432}...`)
const prismaBin = resolve(process.cwd(), 'node_modules', '.bin', 'prisma')
execFileSync(prismaBin, ['db', 'push', '--force-reset', '--accept-data-loss'], {
  stdio: 'inherit',
})
console.log('🎉 Database reset and ready.')
