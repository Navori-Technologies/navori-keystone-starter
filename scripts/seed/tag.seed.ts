import { faker } from '@faker-js/faker'
import type { KeystoneContext } from '@keystone-6/core/types'
import { seedLog } from './seed.utils.ts'

export async function createTags(context: KeystoneContext, count: number): Promise<string[]> {
  const existing = await context.sudo().query.Tag.findMany({ query: 'id' })
  if (existing.length > 0) {
    seedLog.skipped('tag creation', `${existing.length} tags already exist`)
    return existing.map((tag) => tag.id)
  }

  // Unique names: faker.word.noun() repeats past ~50 draws, and Tag has no
  // uniqueness constraint to catch that for us — a Set would silently seed
  // fewer tags than asked for.
  const names = new Set<string>()
  while (names.size < count) names.add(faker.word.noun())

  const tags = await context.sudo().query.Tag.createMany({
    data: [...names].map((name) => ({ name })),
    query: 'id',
  })

  seedLog.created('tags', tags.length)
  return tags.map((tag) => tag.id)
}
