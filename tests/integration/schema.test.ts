// Runs against the real Keystone context/db, not a mock: the schema field
// config (validation, isIndexed: 'unique', relationships) only matters if it
// actually round-trips through Prisma.
// see https://keystonejs.com/docs/guides/testing

import { describe, it, expect, afterEach } from 'vitest'
import { getTestContext } from '../helpers/keystone-context.ts'

describe('Tag list', () => {
  const context = getTestContext()
  const createdIds: string[] = []

  afterEach(async () => {
    await context.sudo().db.Tag.deleteMany({ where: createdIds.map((id) => ({ id })) })
    createdIds.length = 0
  })

  it('creates a tag and reads it back through the query API', async () => {
    const tag = await context.sudo().query.Tag.createOne({
      data: { name: 'quality' },
      query: 'id name',
    })
    createdIds.push(tag.id)

    expect(tag.name).toBe('quality')
  })
})
