import type { KeystoneContext } from '@keystone-6/core/types'
import { createUsers } from './user.seed.ts'
import { createTags } from './tag.seed.ts'
import { createPosts } from './post.seed.ts'
import { getSeedQuantity } from './seed.utils.ts'

export default async function seed(context: KeystoneContext): Promise<void> {
  const userIds = await createUsers(context, getSeedQuantity(5))
  const tagIds = await createTags(context, getSeedQuantity(10))
  await createPosts(context, { count: getSeedQuantity(20), authorIds: userIds, tagIds })
}
