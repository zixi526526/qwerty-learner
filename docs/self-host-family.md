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
