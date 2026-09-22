import { faker } from '@faker-js/faker'
import type { KeystoneContext } from '@keystone-6/core/types'
import { seedLog } from './seed.utils.ts'

type CreatePostsOptions = {
  count: number
  authorIds: string[]
  tagIds: string[]
}

export async function createPosts(
  context: KeystoneContext,
  { count, authorIds, tagIds }: CreatePostsOptions,
): Promise<void> {
  const existing = await context.sudo().query.Post.findMany({ query: 'id' })
  if (existing.length > 0) {
    seedLog.skipped('post creation', `${existing.length} posts already exist`)
    return
  }

  const posts = await context.sudo().query.Post.createMany({
    data: Array.from({ length: count }, () => ({
      title: faker.lorem.sentence(),
      content: faker.lorem
        .paragraphs(3, '\n\n')
        .split('\n\n')
        .map((text) => ({
          type: 'paragraph',
          children: [{ text }],
        })),
      author: { connect: { id: faker.helpers.arrayElement(authorIds) } },
      tags: {
        connect: faker.helpers
          .arrayElements(tagIds, { min: 0, max: Math.min(3, tagIds.length) })
          .map((id) => ({ id })),
      },
    })),
    query: 'id',
  })

  seedLog.created('posts', posts.length)
}
