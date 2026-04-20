const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { openDatabase } = require('../../server/lib/db.cjs')
const { createProfile, getDocument, saveDocument, SETTINGS_TABLE } = require('../../server/lib/store.cjs')

function createEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-db-'))
  return {
    root,
    env: {
      QL_DB_PATH: path.join(root, 'family.sqlite'),
    },
  }
}

test('database migrations create profile docs and revision conflicts are explicit', (t) => {
  const { root, env } = createEnv()
  const db = openDatabase(env)
  t.after(() => {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const profile = createProfile(db, {
    username: 'FamilyDelta',
    normalizedUsername: 'familydelta',
    displayName: 'FamilyDelta',
    welcomeMessage: '',
  })

  const initialSettings = getDocument(db, SETTINGS_TABLE, profile.id)
  assert.equal(initialSettings.revision, 0)
  assert.deepEqual(initialSettings.payload, {})

  const saved = saveDocument(db, SETTINGS_TABLE, profile.id, 0, { currentDict: 'cet4' })
  assert.equal(saved.revision, 1)
  assert.equal(saved.payload.currentDict, 'cet4')

  assert.throws(
    () => saveDocument(db, SETTINGS_TABLE, profile.id, 0, { currentDict: 'cet6' }),
    (error) => error && error.code === 'REVISION_CONFLICT' && error.current.revision === 1,
  )
})
