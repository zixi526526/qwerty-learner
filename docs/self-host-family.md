# Self-hosted family mode

This repo now includes a single-process Node + SQLite backend scaffold for the family multi-user retrofit.

## Runtime layout
- `npm run start` — serves the Fastify backend on one local port (`PORT`, default `4173`)
- `npm run build` — builds the Vite frontend into `build/`
- `server/index.cjs` — backend runtime entrypoint
- `server/app.cjs` — Fastify app with profile/session/sync endpoints
- `server/migrations/001_init.sql` — initial SQLite schema

In production, the intended flow is:
1. `npm install`
2. `npm run build`
3. `npm run start`
4. Point Cloudflare Tunnel (or other reverse proxy) at the local Node port

## Data location
- Default SQLite path: `.data/qwerty-family.sqlite`
- Override with `QL_DB_PATH=/absolute/path/to/qwerty-family.sqlite`
- Override the data directory root with `QL_DATA_DIR=/absolute/path/to/data-dir`

## Environment
- `PORT` — local listen port, default `4173`
- `HOST` — local listen host, default `127.0.0.1`
- `QL_DB_PATH` — explicit SQLite file path
- `QL_DATA_DIR` — data directory root when `QL_DB_PATH` is not set
- `FAMILY_COOKIE_SECRET` — cookie signing secret for non-dev deployments
- `FAMILY_DISABLE_STATIC=1` — disable static asset serving for backend-only tests

## Implemented backend APIs
- `GET /api/health`
- `GET /api/profiles`
- `POST /api/profiles`
- `PATCH /api/profiles/:id`
- `GET /api/profiles/:id/export`
- `DELETE /api/profiles/:id`
- `POST /api/session/select`
- `POST /api/session/logout`
- `GET /api/me`
- `GET /api/sync/bootstrap`
- `PUT /api/sync/settings`
- `PUT /api/sync/progress`
- `POST /api/migrations/import-local`

## Current trust model
Family mode is intentionally low-friction and household-shared:
- usernames identify profiles
- no passwords are required
- destructive profile deletion requires explicit confirmation text
- profile export is available before delete

## Current verification commands
- `npx eslint --ext .ts,.cjs .eslintrc.cjs server/index.ts server/index.cjs server/app.cjs server/lib/db.cjs server/lib/store.cjs server/lib/validation.cjs tests/api/family-server.test.cjs tests/db/store.test.cjs tests/unit/validation.test.cjs`
- `npm run test:unit`
- `npm run test:api`
- `npm run test:db`
- `npm run build`
