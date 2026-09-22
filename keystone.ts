// Welcome to Keystone!
//
// This file is what Keystone uses as the entry-point to your headless backend
//
// Keystone imports the default export of this file, expecting a Keystone configuration object
//   you can find out more at https://keystonejs.com/docs/apis/config

import { config as loadEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from '@keystone-6/core'
import type { ApolloServerPlugin } from '@apollo/server'
import type { KeystoneContext } from '@keystone-6/core/types'

// to keep this file tidy, we define our schema in a different file
import { lists } from './schema.ts'

// authentication is configured separately here too, but you might move this elsewhere
// when you write your list-level access control functions, as they typically rely on session data
import { withAuth, session } from './auth.ts'

// custom routes/middleware on top of Keystone's built-in Express server live here
import { extendExpressApp } from './server.ts'

import { logger } from './logger.ts'

loadEnv()

export default withAuth(
  config({
    db: {
      // for more information on what database might be appropriate for you
      //   see https://keystonejs.com/docs/guides/choosing-a-database#title
      provider: 'postgresql',
      prismaClientOptions: () => ({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      }),
      // Keystone's onConnect type requires Promise<void>; the actual awaiting happens
      // fire-and-forget in the inner IIFE below.
      // oxlint-disable-next-line require-await
      async onConnect(context) {
        // this creates an initial user if none exist so you can log in for development
        // WARNING: do not use this in production
        ;(async () => {
          const sudoContext = context.sudo()
          if ((await sudoContext.db.User.count()) !== 0) return

          const password = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex')
          await sudoContext.db.User.createOne({
            data: { name: 'admin', email: 'admin@example.com', password },
          })
          logger.info(`Created initial user: admin@example.com / ${password}`)
        })().catch((error) => logger.error('Failed to create initial user', error))
      },
    },
    graphql: {
      apolloConfig: {
        plugins: [
          {
            // Apollo's plugin hooks are typed as async (Promise-returning); these just
            // log synchronously.
            // oxlint-disable-next-line require-await
            async requestDidStart(requestContext) {
              logger.debug('graphql operation', {
                operationName: requestContext.request.operationName ?? '(unnamed operation)',
              })
              return {
                // oxlint-disable-next-line require-await -- same as above
                async didEncounterErrors(errorRequestContext) {
                  for (const error of errorRequestContext.errors) {
                    logger.error('graphql error', error)
                  }
                },
              }
            },
          } satisfies ApolloServerPlugin<KeystoneContext>,
        ],
      },
    },
    server: {
      extendExpressApp,
    },
    lists,
    session,
  }),
)
