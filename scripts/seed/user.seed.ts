import { faker } from '@faker-js/faker'
import type { KeystoneContext } from '@keystone-6/core/types'
import { SEED_EMAIL_DOMAIN, SEED_PASSWORD, seedLog } from './seed.utils.ts'

export async function createUsers(context: KeystoneContext, count: number): Promise<string[]> {
  // Only count seeded users — the initial admin must not make the seed skip.
  const existing = await context.sudo().query.User.findMany({
    where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
    query: 'id',
  })
  if (existing.length > 0) {
    seedLog.skipped('user creation', `${existing.length} seeded users already exist`)
    return existing.map((user) => user.id)
  }

  const users = await context.sudo().query.User.createMany({
    data: Array.from({ length: count }, () => ({
      name: faker.person.fullName(),
      email: faker.internet.email({ provider: SEED_EMAIL_DOMAIN }).toLowerCase(),
      password: SEED_PASSWORD,
    })),
    query: 'id',
  })

  seedLog.created('users', users.length)
  return users.map((user) => user.id)
}
