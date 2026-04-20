<<<<<<< HEAD
# Self-hosted family mode

This repo now includes a single-process, single-port Node server + SQLite backend scaffold for the family multi-user retrofit.

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
=======
# Self-host Family Verification Scaffold

This document is the initial self-hosting and verification scaffold for the family multi-user retrofit.
It exists so the implementation lanes can plug into one shared runtime contract while the backend and UI work are still landing.

## Local one-port verification path

Use npm-only commands for the verification lane:

1. `npm run build`
2. `npm run start:local-e2e`
3. `npm run test:e2e:local`

`npm run test:e2e:local` runs Playwright in local mode by setting `PLAYWRIGHT_LOCAL=1`.
That switches the suite to `http://127.0.0.1:4173` and starts the local server through `npm run start:local-e2e`.

## Planned same-origin API surface

- `POST /api/session/select`
- `POST /api/session/logout`
- `GET /api/me`
- `GET /api/profiles`
- `POST /api/profiles`
- `PATCH /api/profiles/:id`
- `DELETE /api/profiles/:id`
- `GET /api/sync/bootstrap`
- `PUT /api/sync/settings`
- `PUT /api/sync/progress`

The intended production shape is a single-port Node server that serves both the built SPA and the same-origin JSON API.

## SQLite expectations

- SQLite remains the canonical persistence layer for family profiles, settings, and progress.
- The runtime should work on VPS-like filesystem paths without relying on `vite preview`.
- Profile deletion should keep an export-first affordance or backup artifact.

## Scaffolded verification lanes

### Unit
- verify npm script wiring for `test:unit`, `test:api`, `test:db`, and `test:e2e:local`
- verify the local Playwright mode still targets the one-port path

### API
- track the required family multi-user endpoints
- keep the same-origin contract visible while backend routes are still landing

### DB
- track uniqueness, isolation, restart persistence, and backup/rollback expectations

### E2E
- keep placeholder scenarios for profile creation, sync, isolation, migration, conflict handling, and regression coverage
>>>>>>> 2c066c6 (Scaffold npm verification lanes for the family self-host path)
