const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { openDatabase } = require('../../server/lib/db.cjs')
const {
  PROGRESS_TABLE,
  SETTINGS_TABLE,
  createProfile,
  deleteProfile,
  getDocument,
  getProfileByUsername,
  saveDocument,
} = require('../../server/lib/store.cjs')

function createEnv() {
  return {
    QL_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-db-')),
  }
}

test('sqlite store persists profile settings and progress across reopen and cascades on delete', async (t) => {
  const env = createEnv()
  const db = openDatabase(env)
  let reopened = null

  t.after(() => {
    reopened?.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const alice = createProfile(db, {
    username: 'alice-db',
    normalizedUsername: 'alice-db',
    displayName: 'Alice DB',
    welcomeMessage: 'Hello Alice',
  })
  const bob = createProfile(db, {
    username: 'bob-db',
    normalizedUsername: 'bob-db',
    displayName: 'Bob DB',
    welcomeMessage: 'Hello Bob',
  })

  saveDocument(db, SETTINGS_TABLE, alice.id, 0, { theme: 'dark' })
  saveDocument(db, PROGRESS_TABLE, alice.id, 0, { chapter: 8 })
  saveDocument(db, SETTINGS_TABLE, bob.id, 0, { theme: 'light' })
  db.close()

  reopened = openDatabase(env)

  assert.equal(getProfileByUsername(reopened, 'alice-db').displayName, 'Alice DB')
  assert.deepEqual(getDocument(reopened, SETTINGS_TABLE, alice.id).payload, { theme: 'dark' })
  assert.deepEqual(getDocument(reopened, PROGRESS_TABLE, alice.id).payload, { chapter: 8 })
  assert.deepEqual(getDocument(reopened, SETTINGS_TABLE, bob.id).payload, { theme: 'light' })

  deleteProfile(reopened, bob.id)
  assert.equal(getProfileByUsername(reopened, 'bob-db'), null)
  assert.equal(reopened.prepare(`SELECT COUNT(*) AS count FROM ${SETTINGS_TABLE} WHERE profile_id = ?`).get(bob.id).count, 0)
})
