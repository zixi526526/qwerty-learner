# Self-hosted family mode

This repo now includes a single-process Node + SQLite backend scaffold plus a family-profile shell where the server is the source of truth for synced settings and practice history.

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

## Docker deployment

The repo ships a multi-stage `Dockerfile` and a `docker-compose.yaml`.

1. `cp .env.example .env`
2. Set `FAMILY_COOKIE_SECRET` (`openssl rand -hex 32`); the server refuses to start in
   production without it.
3. Set `QL_DATA_PATH` to the host directory that should hold the SQLite database.
4. The container runs as uid 1000, so that directory must be owned by uid 1000:
   `sudo chown -R 1000:1000 "$QL_DATA_PATH"`
5. `docker compose up -d --build`

The service listens on `127.0.0.1:7878` on the host and proxies to port 4173 in the
container, so a reverse proxy or Cloudflare Tunnel still terminates the public side.
`GET /api/health` backs the container healthcheck.

The runtime image installs production dependencies only; the build toolchain stays in
the build stage.

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
- `FAMILY_COOKIE_SECRET` — cookie secret; **required** when `NODE_ENV=production`, where
  a missing value now fails startup instead of silently using a public default
- `FAMILY_SESSION_TTL_DAYS` — idle days before a session must be re-selected, default `30`
- `FAMILY_BODY_LIMIT_BYTES` — request body cap, default 32MB (a full local history import
  is far larger than Fastify's 1MB default)
- `QL_DATA_PATH` — host directory bind-mounted to `/app/.data` by docker compose
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
- `PUT /api/sync/practice`
- `POST /api/migrations/import-local`

## Sync model

- Server is the source of truth for family-mode settings and practice history.
- Browser `localStorage` and IndexedDB act as per-profile caches, not the canonical data store.
- Popup/dismissal hints stay device-local.
- Practice data sync happens when a chapter completes, and on every bootstrap.
- Practice records are written to IndexedDB **first** and synced afterwards, so a server
  hiccup can never lose a record on both sides.
- Bootstrap **merges** the server snapshot into the local database, matching records by
  `recordId` and keeping the newer `updatedAt`. Records that exist only on this device
  (made mid-chapter, or while the server was unreachable) are pushed up instead of being
  wiped.
- `id` is Dexie's per-device autoincrement key and is never synced; `recordId` is the
  cross-device identity.
- A pre-profile `RecordDB` database is adopted into the first profile that signs in after
  the upgrade, then removed. It used to be deleted outright, discarding all practice
  history made before family mode.
- If the family server is unavailable, the app blocks synced family interactions instead of silently falling back to divergent local-only writes.

## Current trust model

Family mode is intentionally low-friction and household-shared:

- usernames identify profiles
- no passwords are required
- listing profiles and selecting one is open to anyone who can reach the port
- exporting, renaming and deleting a profile require an active session **for that
  profile**: a caller with no session gets 401, and one signed in as somebody else gets 403. Without this, any device on the network could download or destroy another member's
  full history.
- practice rows are keyed by `(profile_id, record_id)`, so one profile can never overwrite
  another profile's record even when the record ids collide
- destructive profile deletion requires explicit confirmation text
- profile export is available before delete
- sessions expire after `FAMILY_SESSION_TTL_DAYS` idle days and expired rows are swept

This is still a household trust model, not an adversarial one. Keep the port bound to
`127.0.0.1` or the LAN and put authentication in the reverse proxy if the app is exposed
more widely.

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
- bootstrap/settings/progress/practice sync
- revision conflict behavior
- unauthorized sync rejection
- logout/session cleanup
- practice upsert keeps the newest record copy for duplicate `recordId`

### DB

- profile document initialization
- revision conflict handling for server-backed settings

### E2E

- first-use profile creation into the integrated typing shell
- same-device profile isolation
- cross-device settings convergence
- cross-device practice hydration into error book
- strict blocking when the server is unavailable
- stale settings revision conflict recovery
- profile-management selector updates
- typing / analysis / gallery / error-book regression coverage
