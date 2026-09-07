const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { openDatabase } = require('../../server/lib/db.cjs')
const {
  createProfile,
  createSession,
  deleteExpiredSessions,
  getSession,
  getSessionTtlMs,
  touchSession,
} = require('../../server/lib/store.cjs')

function createEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-session-'))
  return { root, env: { QL_DB_PATH: path.join(root, 'family.sqlite') } }
}

function setup(t) {
  const { root, env } = createEnv()
  const db = openDatabase(env)
  t.after(() => {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const profile = createProfile(db, {
    username: 'Sessions',
    normalizedUsername: 'sessions',
    displayName: 'Sessions',
    welcomeMessage: '',
  })

  return { db, profile }
}

function ageSession(db, sessionId, msAgo) {
  const stale = new Date(Date.now() - msAgo).toISOString()
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(stale, sessionId)
  return stale
}

test('an idle session stops resolving once it passes the TTL', (t) => {
  const { db, profile } = setup(t)
  const sessionId = createSession(db, profile.id)
  const ttlMs = 1000

  assert.ok(getSession(db, sessionId, { ttlMs }), 'a fresh session resolves')

  ageSession(db, sessionId, ttlMs * 2)

  assert.equal(getSession(db, sessionId, { ttlMs }), null, 'an expired session must not resolve')
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM sessions WHERE id = ?').get(sessionId).total,
    0,
    'the expired row is dropped rather than left behind',
  )
})

test('deleteExpiredSessions sweeps only the rows past the TTL', (t) => {
  const { db, profile } = setup(t)
  const fresh = createSession(db, profile.id)
  const stale = createSession(db, profile.id)
  const ttlMs = 1000

  ageSession(db, stale, ttlMs * 2)

  assert.equal(deleteExpiredSessions(db, ttlMs), 1)
  assert.ok(getSession(db, fresh, { ttlMs }))
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 1)
})

test('touchSession only writes once the stored timestamp is actually stale', (t) => {
  const { db, profile } = setup(t)
  const sessionId = createSession(db, profile.id)
  const session = getSession(db, sessionId)

  // A page load fires many API requests in quick succession; they must not each
  // cost a SQLite write.
  assert.equal(touchSession(db, sessionId, session.lastSeenAt), false)
  assert.equal(touchSession(db, sessionId, session.lastSeenAt), false)

  const staleTimestamp = ageSession(db, sessionId, 5 * 60 * 1000)
  assert.equal(touchSession(db, sessionId, staleTimestamp), true)

  const refreshed = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(sessionId)
  assert.ok(refreshed.last_seen_at > staleTimestamp, 'a stale session is refreshed')
})

test('the session TTL is configurable and falls back to a bounded default', () => {
  assert.equal(getSessionTtlMs({ FAMILY_SESSION_TTL_DAYS: '7' }), 7 * 24 * 60 * 60 * 1000)
  assert.equal(getSessionTtlMs({}), 30 * 24 * 60 * 60 * 1000)
  assert.equal(getSessionTtlMs({ FAMILY_SESSION_TTL_DAYS: 'nonsense' }), 30 * 24 * 60 * 60 * 1000)
  assert.equal(getSessionTtlMs({ FAMILY_SESSION_TTL_DAYS: '-1' }), 30 * 24 * 60 * 60 * 1000)
})
