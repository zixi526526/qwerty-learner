const crypto = require('node:crypto')
const { normalizeUsername } = require('./validation.cjs')

const SETTINGS_TABLE = 'user_settings'
const PROGRESS_TABLE = 'user_progress'

function nowIso() {
  return new Date().toISOString()
}

function parsePayload(payload) {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

function serializePayload(payload) {
  return JSON.stringify(payload ?? {})
}

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    displayName: row.display_name,
    welcomeMessage: row.welcome_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  }
}

function ensureProfileDocs(db, profileId) {
  const now = nowIso()
  db.prepare(
    `INSERT INTO ${SETTINGS_TABLE} (profile_id, revision, payload, schema_version, updated_at)
     VALUES (?, 0, '{}', 1, ?)
     ON CONFLICT(profile_id) DO NOTHING`,
  ).run(profileId, now)
  db.prepare(
    `INSERT INTO ${PROGRESS_TABLE} (profile_id, revision, payload, schema_version, updated_at)
     VALUES (?, 0, '{}', 1, ?)
     ON CONFLICT(profile_id) DO NOTHING`,
  ).run(profileId, now)
}

function listProfiles(db) {
  return db
    .prepare('SELECT * FROM profiles ORDER BY LOWER(display_name) ASC, id ASC')
    .all()
    .map(mapProfile)
}

function getProfileById(db, id) {
  return mapProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(id))
}

function getProfileByUsername(db, username) {
  return mapProfile(db.prepare('SELECT * FROM profiles WHERE normalized_username = ?').get(normalizeUsername(username)))
}

function createProfile(db, profileInput) {
  const timestamp = nowIso()
  const result = db
    .prepare(
      `INSERT INTO profiles (
        username,
        normalized_username,
        display_name,
        welcome_message,
        created_at,
        updated_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)` ,
    )
    .run(
      profileInput.username,
      profileInput.normalizedUsername,
      profileInput.displayName,
      profileInput.welcomeMessage,
      timestamp,
      timestamp,
      timestamp,
    )

  ensureProfileDocs(db, result.lastInsertRowid)
  return getProfileById(db, result.lastInsertRowid)
}

function updateProfile(db, id, updates) {
  const existing = getProfileById(db, id)
  if (!existing) {
    return null
  }

  const timestamp = nowIso()
  db.prepare(
    `UPDATE profiles
     SET username = ?,
         normalized_username = ?,
         display_name = ?,
         welcome_message = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(updates.username, updates.normalizedUsername, updates.displayName, updates.welcomeMessage, timestamp, id)

  return getProfileById(db, id)
}

function exportProfileBundle(db, profileId) {
  const profile = getProfileById(db, profileId)
  if (!profile) return null
  ensureProfileDocs(db, profileId)

  return {
    profile,
    settings: getDocument(db, SETTINGS_TABLE, profileId),
    progress: getDocument(db, PROGRESS_TABLE, profileId),
    exportedAt: nowIso(),
  }
}

function deleteProfile(db, profileId) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId)
}

function createSession(db, profileId) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()
  db.prepare('INSERT INTO sessions (id, profile_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(id, profileId, timestamp, timestamp)
  db.prepare('UPDATE profiles SET last_seen_at = ? WHERE id = ?').run(timestamp, profileId)
  return id
}

function getSession(db, sessionId) {
  if (!sessionId) return null
  const row = db
    .prepare(
      `SELECT sessions.id, sessions.profile_id, sessions.created_at, sessions.last_seen_at,
              profiles.username, profiles.normalized_username, profiles.display_name,
              profiles.welcome_message, profiles.updated_at, profiles.created_at AS profile_created_at,
              profiles.last_seen_at AS profile_last_seen_at
       FROM sessions
       JOIN profiles ON profiles.id = sessions.profile_id
       WHERE sessions.id = ?`,
    )
    .get(sessionId)

  if (!row) return null

  return {
    id: row.id,
    profileId: row.profile_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    profile: {
      id: row.profile_id,
      username: row.username,
      normalizedUsername: row.normalized_username,
      displayName: row.display_name,
      welcomeMessage: row.welcome_message,
      updatedAt: row.updated_at,
      createdAt: row.profile_created_at,
      lastSeenAt: row.profile_last_seen_at,
    },
  }
}

function touchSession(db, sessionId) {
  const timestamp = nowIso()
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(timestamp, sessionId)
}

function destroySession(db, sessionId) {
  if (!sessionId) return
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

function getDocument(db, tableName, profileId) {
  ensureProfileDocs(db, profileId)
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE profile_id = ?`).get(profileId)
  return {
    revision: row.revision,
    payload: parsePayload(row.payload),
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
  }
}

function saveDocument(db, tableName, profileId, baseRevision, payload, { force = false } = {}) {
  const current = getDocument(db, tableName, profileId)

  if (!force && current.revision !== baseRevision) {
    const error = new Error('Revision conflict')
    error.code = 'REVISION_CONFLICT'
    error.current = current
    throw error
  }

  const nextRevision = current.revision + 1
  const updatedAt = nowIso()
  db.prepare(`UPDATE ${tableName} SET revision = ?, payload = ?, updated_at = ? WHERE profile_id = ?`).run(
    nextRevision,
    serializePayload(payload),
    updatedAt,
    profileId,
  )

  return getDocument(db, tableName, profileId)
}

module.exports = {
  PROGRESS_TABLE,
  SETTINGS_TABLE,
  createProfile,
  createSession,
  deleteProfile,
  destroySession,
  exportProfileBundle,
  getDocument,
  getProfileById,
  getProfileByUsername,
  getSession,
  listProfiles,
  saveDocument,
  touchSession,
  updateProfile,
}
