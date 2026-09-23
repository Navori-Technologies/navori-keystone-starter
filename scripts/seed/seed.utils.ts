import { faker } from '@faker-js/faker'

// Shared seed password — satisfies User.password's validation (Keystone's
// password field just needs a non-empty string here, no complexity rule).
export const SEED_PASSWORD = 'Seed#2025!'

// Every seeded user gets this email domain, which is how createUsers tells its
// own rows apart from the initial admin that keystone.ts's onConnect creates on
// startup. `.test` is reserved (RFC 2606), so it can't collide with a real one.
export const SEED_EMAIL_DOMAIN = 'seed.test'

/**
 * Reads `SEED_FAKER_SEED` and seeds Faker for deterministic runs. No-op when
 * unset, so the default is a fresh random dataset every run. Set it in CI to
 * reproduce a data-shape failure, or to snapshot-test against fixed output.
 */
export function applySeedFakerSeed(): void {
  const raw = (process.env.SEED_FAKER_SEED ?? '').trim()
  if (!raw) return
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return
  faker.seed(n)
  console.log(`🎲 Faker seeded with ${n} for deterministic seed run`)
}

/** Reads `SEED_QUANTITY`, falling back to `fallback` when unset or invalid. */
export function getSeedQuantity(fallback: number): number {
  const raw = (process.env.SEED_QUANTITY ?? '').trim()
  if (!raw) return fallback
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const seedLog = {
  skipped(label: string, details?: string) {
    console.log(`♻️  Skipped ${label}${details ? ` (${details})` : ''}.`)
  },
  created(label: string, count: number, details?: string) {
    console.log(`✅ Created ${count} ${label}${details ? ` ${details}` : ''}`)
  },
}
