const apiScenarios = [
  'POST /api/session/select creates or resumes the active profile session',
  'POST /api/session/logout clears the active profile session',
  'GET /api/me returns the active profile and welcome message',
  'GET /api/profiles lists family profiles',
  'POST /api/profiles creates a family profile',
  'PATCH /api/profiles/:id updates profile metadata',
  'DELETE /api/profiles/:id removes profile data with explicit friction',
  'GET /api/sync/bootstrap loads active user settings and progress',
  'PUT /api/sync/settings persists user settings',
  'PUT /api/sync/progress persists user progress',
]

const dbScenarios = [
  'profiles.username remains unique after normalization',
  'user_settings stay isolated by profile_id',
  'user_progress stays isolated by profile_id',
  'SQLite data survives process restart',
  'delete flow keeps an export-first affordance or backup artifact',
  'migration writes can be backed up or rolled back',
]

const e2eScenarios = [
  'first-use profile creation',
  'cross-device sync convergence',
  'same-device profile isolation',
  'profile management updates the selector state',
  'legacy local-only migration into the chosen profile',
  'stale revision conflict handling',
  'typing, analysis, gallery, and error-book regression coverage',
]

module.exports = {
  apiScenarios,
  dbScenarios,
  e2eScenarios,
}
