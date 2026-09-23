# Navori Keystone Starter

Starter opinionado de [Keystone](https://keystonejs.com) (headless CMS + GraphQL API sobre Prisma) para arrancar proyectos de [Navori Technologies](https://github.com/Navori-Technologies). Trae ya decidido el stack de runtime, base de datos, testing, storage, logging, seguridad y CI — la idea es clonar y empezar a modelar tu `schema.ts`, no reconstruir la infraestructura cada vez.

## Stack

| Pieza               | Elección                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Runtime             | Node.js >= 24                                                                                                   |
| Package manager     | [Bun](https://bun.sh) >= 1.4                                                                                    |
| Lenguaje            | TypeScript 7                                                                                                    |
| Base de datos       | PostgreSQL (`@prisma/adapter-pg`)                                                                               |
| Lint / format       | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) |
| Testing             | [Vitest](https://vitest.dev) + [Supertest](https://github.com/ladjs/supertest)                                  |
| Storage de archivos | Local en dev, S3-compatible en prod (AWS S3 / Cloudflare R2 / MinIO)                                            |
| Logging             | [Winston](https://github.com/winstonjs/winston)                                                                 |
| Seguridad           | [Helmet](https://helmetjs.github.io) + rate limiting                                                            |
| Git hooks           | [Husky](https://typicode.github.io/husky) (pre-commit informativo)                                              |
| CI                  | GitHub Actions — semgrep, jscpd, lint, format, typecheck                                                        |
| Contenedores        | `Dockerfile` (producción) + `Dockerfile.dev` + `docker-compose.yml`                                             |

## Quickstart

```
cp .env.example .env
docker compose up -d db
bun install
bun run dev
```

Esto levanta Postgres local, instala dependencias y arranca Keystone en [http://localhost:3000](http://localhost:3000) — te crea un usuario admin de desarrollo (revisa el log por el password generado).

El punto de entrada de la config es [`./keystone.ts`](./keystone.ts); las listas del modelo de datos viven en [`./schema.ts`](./schema.ts).

## Guía por pieza

### Database

Usa [PostgreSQL](https://keystonejs.com/docs/config/config#postgresql) vía `@prisma/adapter-pg`, configurado en [`./keystone.ts`](./keystone.ts) y [`./prisma.config.ts`](./prisma.config.ts). Ambos leen `DATABASE_URL` desde el entorno (cargado desde `.env` vía `dotenv`).

`docker-compose.yml` levanta un Postgres local (`docker compose up -d db`). El arranque en dev empuja el schema directo a la base (`db push`, no `prisma migrate`) para velocidad — cuando necesites migraciones reales, cambia a `prisma migrate dev` localmente y `prisma migrate deploy` como paso de release (ver la nota en [`./Dockerfile`](./Dockerfile)).

Más sobre configuración de base de datos en la [documentación de Keystone](https://keystonejs.com/docs/config/config#db).

### Docker

- **`Dockerfile.dev`** — imagen de desarrollo local: solo instala dependencias, el código llega por bind-mount desde `docker-compose.yml`, corre `bun run dev`.
- **`Dockerfile`** — imagen de producción: build multi-stage (`deps` → `builder` corre `keystone build` → `production`). La imagen final solo lleva `node_modules`, el bundle `.keystone/` y `generated/` (cliente Prisma + tipos de Keystone) — `keystone start` lee el bundle, no el `.ts` fuente, así que no hace falta nada más. Expone `/healthz` (ver [`./server.ts`](./server.ts)) como `HEALTHCHECK`.
- **`docker-compose.yml`** — `app` (construido desde `Dockerfile.dev`) + `db` (`postgres:18-alpine`) para desarrollo local.

Las migraciones NO corren dentro del `CMD` de la imagen de producción — corre `bunx prisma migrate deploy` como paso de release separado en tu pipeline de deploy, una vez por deploy, para evitar que deploys/reinicios concurrentes compitan por el lock de migración.

### Storage de archivos e imágenes

Los campos `image`/`file` necesitan una [`StorageStrategy`](https://keystonejs.com/docs/config/config#storage-images-and-files) — Keystone 8 quitó el atajo viejo `storage: { kind: 's3' }`. [`./storage.ts`](./storage.ts) provee `createStorageStrategy(kind)`, elegido por `STORAGE_DRIVER`:

- **`local`** (default) — escribe en `./uploads/<kind>/<key>`, servido por el middleware estático de `server.ts` en `/uploads`. Nada que provisionar; bueno para dev local.
- **`s3`** — cualquier object store S3-compatible, vía el SDK de AWS. Funciona con AWS S3 tal cual; para **Cloudflare R2** (o MinIO), configura `S3_ENDPOINT` al endpoint compatible (`https://<account_id>.r2.cloudflarestorage.com` para R2) y `S3_REGION=auto` — mismo código, sin SDK aparte.

Ver `.env.example` para la lista completa de variables `S3_*`. El campo `User.avatar` en `schema.ts` demuestra cómo conectar un campo.

### Logging

[`./logger.ts`](./logger.ts) exporta un `logger` de Winston — JSON a stdout en producción (para que tu orquestador de contenedores/agregador de logs lo capture), líneas coloreadas legibles en desarrollo. Ambos redactan nombres de campos sensibles comunes (`password`, `token`, `secret`, …) de la metadata logueada. `LOG_LEVEL` controla la verbosidad (default `info`). `keystone.ts` ya enruta su logging de requests/errores de GraphQL a través de él — usa el mismo `logger` en el resto de tu código en vez de `console.log`.

### Data seed

`bun run db:seed` puebla la base con datos de demo — ver [`./scripts/seed`](./scripts/seed). Idempotente: cada función de seed por lista revisa si ya hay filas y se salta, así que correrlo dos veces (o contra una base que ya tiene datos) es seguro. `SEED_QUANTITY` controla cuántas filas por lista; `SEED_FAKER_SEED` hace el output determinístico (útil en CI para reproducir un fallo de forma de datos).

Para empezar de cero: `bun run db:nuke` borra toda la base y la recrea vacía desde `schema.prisma` (`prisma db push --force-reset`, ver [`./scripts/nuke-db.ts`](./scripts/nuke-db.ts)); `bun run db:nuke:seed` además la vuelve a poblar. **Solo para desarrollo local**: se niega a correr si el host de `DATABASE_URL` no es `localhost`, `127.0.0.1`, `[::1]` o `db` (el servicio de docker-compose). Con el stack en Docker, córrelo dentro del contenedor: `docker compose exec app bun run db:nuke:seed`. El admin inicial lo crea la app al arrancar, así que reinicia el contenedor (`docker compose restart app`) si lo necesitas después del nuke.

### Seguridad

[`server.ts`](./server.ts) engancha tres protecciones base en el servidor Express de Keystone antes de que se monte GraphQL/Admin UI, así que cubren todo, GraphQL incluido:

- **[Helmet](https://helmetjs.github.io)** — headers de seguridad estándar (HSTS, `X-Frame-Options`, `X-Content-Type-Options`, etc). `contentSecurityPolicy` queda desactivado: la Admin UI es una app Next.js con scripts inline que Keystone controla, no este archivo, y un CSP por default la rompería — habilita uno scopeado a tus propias rutas cuando tengas algo que proteger.
- **Rate limiting en `/api/graphql`** — [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) con `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` (default: 300 requests / 15 min). Usa el store en memoria por default, lo que significa que el límite es **por proceso** — bien para una sola instancia, pero con más de una detrás de un load balancer el límite real se vuelve `instancias × RATE_LIMIT_MAX` sin que nadie se entere. Apunta a un store compartido (ej. [`rate-limit-redis`](https://github.com/express-rate-limit/rate-limit-redis)) cuando corras más de una.
- **Límite de tamaño de body JSON** — `express.json({ limit: MAX_JSON_SIZE, strict: true })`, default `1mb`. Protege contra DoS de payload grande; los uploads de archivos de GraphQL van por multipart, así que esto no los afecta.

### Pre-commit hook & CI

[`.husky/pre-commit`](./.husky/pre-commit) corre `tsc --noEmit` (proyecto completo) más `oxlint`/`oxfmt --check` acotado a archivos en stage — y es **informativo, nunca bloquea el commit**. Acotar lint/format a archivos en stage evita volcar cada warning preexistente en cada commit; `tsc` no se puede acotar así (revisa todo el proyecto o nada) y corre completo a propósito, ya que un cambio en un archivo puede romper el tipado de otro. El trade-off: esto solo no impide commitear código que no compila — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) es el gate real, corre en cada push/PR a `main` (más `workflow_dispatch` para correrlo a mano en cualquier branch), con dos jobs:

- **`static-analysis`** — [semgrep](https://semgrep.dev) (ruleset `p/default`, acotado a hallazgos NUEVOS vs. el commit base — un scan completo del repo fallaría por deuda preexistente) y [jscpd](https://github.com/kucherenko/jscpd) (duplicación de código, ≥100 tokens / ≥10 líneas cuenta como clon, falla arriba de 5% duplicado).
- **`quality`** — lint, format check, typecheck.

Sin correr tests ni build de Docker, a propósito por ahora — agrega `bun run test` (ver la sección de Testing) y un job de smoke test de Docker cuando quieras que el CI cubra eso también.

### Auth

La autenticación vive en su propio archivo ([`./auth.ts`](./auth.ts)) para mantener `keystone.ts` legible. Para explorar sin auth activado, comenta el `isAccessAllowed` en `keystone.ts`.

Más en la [documentación de Authentication API](https://keystonejs.com/docs/apis/auth#authentication-api).

### Agregar un frontend

Como CMS headless, Keystone puede usarse con cualquier frontend que hable GraphQL. Expone un endpoint GraphQL en `/api/graphql` (por default [http://localhost:3000/api/graphql](http://localhost:3000/api/graphql)).

### Testing

Los tests viven en [`./tests`](./tests) y corren contra un contexto real de Keystone (vía `getContext`), no mocks — ver [`./tests/helpers/keystone-context.ts`](./tests/helpers/keystone-context.ts). Requiere Postgres corriendo (`docker compose up -d db`). Como este starter usa `db push` (no `prisma migrate`) para el arranque más rápido en dev, `bun run test` empuja el schema él mismo antes de correr (ver [`./tests/helpers/global-setup.ts`](./tests/helpers/global-setup.ts)) — sin paso extra de setup, pero cada test es responsable de limpiar las filas que crea.

`tests/integration/server.test.ts` muestra la misma idea para rutas custom de Express: monta `extendExpressApp` en una instancia `express()` desnuda y le pega con Supertest, en vez de levantar el servidor HTTP completo de Keystone.
