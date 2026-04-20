# Self-hosted family mode

This repo now includes a single-process Node + SQLite backend scaffold plus a family-profile shell that can be verified through npm-only commands.

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
4. Point Cloudflare Tunnel (or another reverse proxy) at the local Node port

## VPS local-only deployment
- Keep the app bound to `127.0.0.1:4173`
- Store runtime data outside the repo, for example `/home/angbo0412OMX/qwerty2-data`
- Use `deploy/qwerty2.env.example` as the env template
- Use `deploy/systemd/qwerty2.service` as the systemd unit template
- Install flow:
  1. `npm install`
  2. `npm run build`
  3. copy the env file to `/etc/qwerty2/qwerty2.env`
  4. copy the service file to `/etc/systemd/system/qwerty2.service`
  5. `sudo systemctl daemon-reload`
  6. `sudo systemctl enable --now qwerty2.service`

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
- `PLAYWRIGHT_LOCAL=1` — switch Playwright to the local single-port verification path

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

## Verification lanes
Use npm-only verification commands for the family mode path:
- `npm test`
- `npm run test:unit`
- `npm run test:api`
- `npm run test:db`
- `npm run test:e2e:local`
- `npm run build`

### Local e2e path
1. `npm run build`
2. `npm run start:local-e2e`
3. `npm run test:e2e:local`

`npm run start:local-e2e` resets `.data/` and starts the single-port Node server on `http://127.0.0.1:4173`.
`npm run test:e2e:local` rebuilds the frontend, starts the backend through Playwright's `webServer`, and runs the integrated local family-shell smoke test in Chromium.

## Verification coverage snapshot
### Unit
- username normalization / validation helpers
- welcome-message and display-name sanitizers

### API
- profile create/select/update/delete/export
- `/api/me` session identity
- bootstrap/settings/progress sync
- revision conflict behavior
- unauthorized sync rejection
- logout/session cleanup

### DB
- profile document initialization
- revision conflict handling for server-backed settings

### E2E
- first-use profile creation into the integrated typing shell
- scaffold placeholders remain for sync, isolation, migration, conflict handling, and broader regression coverage
