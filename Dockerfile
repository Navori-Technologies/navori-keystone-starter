# syntax=docker/dockerfile:1.7
# Dockerfile — production build
#
# `keystone build` bundles keystone.ts/schema.ts/auth.ts/server.ts (and the
# Admin UI) into .keystone/. `keystone start` only ever reads that bundle, so
# the production stage doesn't need the raw .ts source at all — just
# node_modules, the bundle, and the generated Prisma client/types it imports.

# ── bun binary (musl-compatible) ──────────────────────────────────────────
FROM oven/bun:1-alpine AS bun-bin

# ── base ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app

# ── deps: production-only install ─────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
# --ignore-scripts: the only lifecycle script here is `prepare: husky`, which
# no-ops with no .git directory anyway (and .dockerignore excludes .husky/).
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --ignore-scripts

# ── builder: prisma generate + keystone build ─────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `keystone build` needs DATABASE_URL/SESSION_SECRET to parse the config, but
# doesn't connect to the database — dummies are enough. This ENV never
# reaches the production stage.
ENV DATABASE_URL=postgresql://build:build@localhost/build \
    SESSION_SECRET=build-placeholder-minimum-32-characters \
    NODE_ENV=production

RUN bunx prisma generate
RUN --mount=type=cache,target=/app/.keystone/admin/.next/cache \
    node node_modules/.bin/keystone build
RUN ln -s .keystone/admin/.next .next

# ── production ─────────────────────────────────────────────────────────────
FROM base AS production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=deps    --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/generated    ./generated
COPY --from=builder --chown=nodejs:nodejs /app/.keystone    ./.keystone
RUN ln -s .keystone/admin/.next .next
COPY --chown=nodejs:nodejs package.json ./

USER nodejs
EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# Migrations do NOT run here. Run `bunx prisma migrate deploy` as a separate
# release step in your deploy pipeline, once per deploy — not in this CMD, or
# concurrent deploys/restarts can race for the same migration lock.
CMD ["bun", "run", "start"]
