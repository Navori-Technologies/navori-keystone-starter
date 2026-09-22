# Keystone Project Starter

Welcome to Keystone!

## Requisitos

- Node.js >= 24 (ver [.node-version](./.node-version))
- [Bun](https://bun.sh) >= 1.4 como package manager
- [Docker](https://www.docker.com) (o un Postgres local propio) — este starter usa PostgreSQL, no SQLite
- TypeScript 7 (instalado como dependencia del proyecto)
- [oxlint](https://oxc.rs/docs/guide/usage/linter.html) para linting y [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) para formateo (`bun run lint`, `bun run format`, `bun run format:check`)
- [Vitest](https://vitest.dev) + [Supertest](https://github.com/ladjs/supertest) para testing (`bun run test`, `bun run test:watch`, `bun run test:coverage`)
- [Winston](https://github.com/winstonjs/winston) para logging estructurado (`./logger.ts`)
- [Husky](https://typicode.github.io/husky) para el pre-commit hook (se activa solo si el proyecto es un repo git — `bun install` corre `prepare: husky`)

Copy the env file, start Postgres, install dependencies and start Keystone:

```
cp .env.example .env
docker compose up -d db
bun install
bun run dev
```

To view the config for your new app, look at [./keystone.ts](./keystone.ts)

This project starter is designed to give you a sense of the power Keystone can offer you, and show off some of its main features. It's also a pretty simple setup if you want to build out from it.

We recommend you use this alongside our [getting started guide](https://keystonejs.com/docs/getting-started), which will walk you through what you get as part of this starter.

If you want an overview of all the features Keystone offers, check out our [features](https://keystonejs.com/why-keystone#features) page.

## Some Quick Notes On Getting Started

### Database

This starter uses [PostgreSQL](https://keystonejs.com/docs/config/config#postgresql) via `@prisma/adapter-pg`, configured in [./keystone.ts](./keystone.ts) and [./prisma.config.ts](./prisma.config.ts). Both read `DATABASE_URL` from the environment (loaded from `.env` via `dotenv` — copy `.env.example` to get started).

`docker-compose.yml` runs a local Postgres for development (`docker compose up -d db`). Dev startup pushes the schema straight to the database (`db push`, not `prisma migrate`) for speed — once you need real migrations, switch to `prisma migrate dev` locally and `prisma migrate deploy` as a release step (see the note in [./Dockerfile](./Dockerfile)).

For more on database configuration, see the [database configuration docs](https://keystonejs.com/docs/config/config#db).

### Docker

- **`Dockerfile.dev`** — local development image: installs dependencies only, source code arrives via the bind-mount in `docker-compose.yml`, runs `bun run dev`.
- **`Dockerfile`** — production image: multi-stage build (`deps` → `builder` runs `prisma generate` + `keystone build` → `production`). The final image only ships `node_modules`, the built `.keystone/` bundle and `generated/` (Prisma client + Keystone types) — `keystone start` reads the bundle, not the raw `.ts` source, so nothing else is needed. Exposes a `/healthz` route (see [./server.ts](./server.ts)) as the `HEALTHCHECK`.
- **`docker-compose.yml`** — `app` (built from `Dockerfile.dev`) + `db` (`postgres:18-alpine`) for local development.

Migrations do **not** run inside the production image's `CMD` — run `bunx prisma migrate deploy` as a separate release step in your deploy pipeline, once per deploy, to avoid concurrent deploys/restarts racing for the same migration lock.

### File & image storage

Image/file fields need a [`StorageStrategy`](https://keystonejs.com/docs/config/config#storage-images-and-files) — Keystone 8 dropped the old `storage: { kind: 's3' }` shortcut. [./storage.ts](./storage.ts) provides `createStorageStrategy(kind)`, picked by `STORAGE_DRIVER`:

- **`local`** (default) — writes to `./uploads/<kind>/<key>`, served by `server.ts`'s static middleware at `/uploads`. Nothing to provision; good for local dev.
- **`s3`** — any S3-compatible object store, via the AWS SDK. Works for AWS S3 as-is; for **Cloudflare R2** (or MinIO), set `S3_ENDPOINT` to the compatible endpoint (`https://<account_id>.r2.cloudflarestorage.com` for R2) and `S3_REGION=auto` — same code path, no separate SDK.

See `.env.example` for the full list of `S3_*` variables. `schema.ts`'s `User.avatar` field demonstrates wiring a field to it.

### Logging

[`./logger.ts`](./logger.ts) exports a Winston `logger` — JSON to stdout in production (for your container orchestrator/log aggregator to pick up), colorized human-readable lines in development. Both redact common sensitive field names (`password`, `token`, `secret`, …) from logged metadata. `LOG_LEVEL` controls verbosity (default `info`). `keystone.ts` already routes its GraphQL request/error logging through it — use the same `logger` anywhere else in your app code instead of `console.log`.

### Data seed

`bun run db:seed` populates the database with demo data — see [./scripts/seed](./scripts/seed). Idempotent: each list's seed function checks for existing rows and skips itself, so running it twice (or against a database that already has data) is safe. `SEED_QUANTITY` controls how many rows per list; `SEED_FAKER_SEED` makes the output deterministic (set it in CI to reproduce a data-shape failure).

### Security

[`server.ts`](./server.ts) wires three baseline protections into Keystone's Express server before GraphQL/Admin UI are mounted, so they cover everything, GraphQL included:

- **[Helmet](https://helmetjs.github.io)** — standard security headers (HSTS, `X-Frame-Options`, `X-Content-Type-Options`, etc). `contentSecurityPolicy` is left off: the Admin UI is a Next.js app with inline scripts Keystone controls, not this file, and a default CSP would break it — enable one scoped to your own routes once you have some to protect.
- **Rate limiting on `/api/graphql`** — [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) with `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` (defaults: 300 requests / 15 min). Uses the in-memory store by default, which means the limit is **per process** — fine for one instance, but with more than one behind a load balancer the real limit becomes `instances × RATE_LIMIT_MAX` without anyone being told. Point it at a shared store (e.g. [`rate-limit-redis`](https://github.com/express-rate-limit/rate-limit-redis)) once you run more than one.
- **JSON body size limit** — `express.json({ limit: MAX_JSON_SIZE, strict: true })`, default `1mb`. Guards against large-payload DoS; GraphQL file uploads go through multipart instead, so this doesn't affect them.

### Pre-commit hook & CI

[`.husky/pre-commit`](./.husky/pre-commit) runs `tsc --noEmit` (full project) plus `oxlint`/`oxfmt --check` scoped to staged files — and is **informational, it never blocks the commit**. Scoping lint/format to staged files avoids dumping every pre-existing warning on every commit; `tsc` can't be scoped that way (it checks the whole project or nothing) and runs in full on purpose, since a change in one file can break another file's types. The trade-off: this alone doesn't stop you from committing code that doesn't compile — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) is the actual hard gate, running on every push/PR to `main` (plus `workflow_dispatch` for a manual run on any branch), with two jobs:

- **`static-analysis`** — [semgrep](https://semgrep.dev) (the `p/default` ruleset, scoped to findings NEW vs. the base commit — a full-repo scan would fail on whatever pre-existing debt is already there) and [jscpd](https://github.com/kucherenko/jscpd) (code duplication, ≥100 tokens / ≥10 lines counts as a clone, fails above 5% duplicated).
- **`quality`** — lint, format check, typecheck.

No test run, no Docker build, on purpose for now — add `bun run test` (see the Testing section) and a Docker smoke job back in once you want CI to cover those too.

### Auth

We've put auth into its own file to make this humble starter easier to navigate. To explore it without auth turned on, comment out the `isAccessAllowed` on line 21 of the Keystone file [./keystone.ts](./keystone.ts).

For more on auth, check out our [Authentication API Docs](https://keystonejs.com/docs/apis/auth#authentication-api)

### Adding a frontend

As a Headless CMS, Keystone can be used with any frontend that uses GraphQL. It provides a GraphQL endpoint you can write queries against at `/api/graphql` (by default [http://localhost:3000/api/graphql](http://localhost:3000/api/graphql)). At Thinkmill, we tend to use [Next.js](https://nextjs.org/) and [Apollo GraphQL](https://www.apollographql.com/docs/react/get-started/) as our frontend and way to write queries, but if you have your own favourite, feel free to use it.

A walkthrough on how to do this is forthcoming, but in the meantime our [todo example](https://github.com/keystonejs/keystone-react-todo-demo) shows a Keystone set up with a frontend. For a more full example, you can also look at an example app we built for [Prisma Day 2021](https://github.com/keystonejs/prisma-day-2021-workshop)

### Testing

Tests live in [./tests](./tests) and run against a real Keystone context (via `getContext`), not mocks — see [./tests/helpers/keystone-context.ts](./tests/helpers/keystone-context.ts). Requires Postgres running (`docker compose up -d db`). Since this starter uses `db push` (not `prisma migrate`) for the fastest dev startup, `bun run test` pushes the schema itself before running (see [./tests/helpers/global-setup.ts](./tests/helpers/global-setup.ts)) — no extra setup step needed, but each test is responsible for cleaning up the rows it creates.

`tests/integration/server.test.ts` shows the same idea for custom Express routes: it mounts `extendExpressApp` on a bare `express()` instance and hits it with Supertest, instead of booting the full Keystone HTTP server.

### Embedding Keystone in a Next.js frontend

While Keystone works as a standalone app, you can embed your Keystone app into a [Next.js](https://nextjs.org/) app. This is quite a different setup to the starter, and we recommend checking out our walkthrough for that [here](https://keystonejs.com/docs/walkthroughs/embedded-mode-with-sqlite-nextjs#how-to-embed-keystone-sq-lite-in-a-next-js-app).
