import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

loadEnv()

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
