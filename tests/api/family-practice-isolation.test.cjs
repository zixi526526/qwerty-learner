const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { buildApp } = require('../../server/app.cjs')

function createEnv() {
  return {
    NODE_ENV: 'test',
    FAMILY_COOKIE_SECRET: 'test-secret',
    FAMILY_DISABLE_STATIC: '1',
    QL_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-isolation-')),
  }
}

async function createApp() {
  const env = createEnv()
  const app = buildApp({ env, logger: false })
  await app.ready()
  return { app, env }
}

async function selectProfile(app, username) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session/select',
    payload: { username },
  })
  assert.equal(response.statusCode, 200)
  const cookie = response.cookies.find((candidate) => candidate.name === 'qwerty_family_session')
  assert.ok(cookie, `expected a session cookie for ${username}`)
  return { cookie: cookie.value, profile: response.json().profile }
}

function wordRecord(overrides) {
  return {
    recordId: 'shared-record-id',
    updatedAt: '2026-04-20T00:00:01.000Z',
    word: 'baseline',
    timeStamp: 1,
    dict: 'cet4',
    chapter: 0,
    timing: [100],
    wrongCount: 0,
    mistakes: {},
    ...overrides,
  }
}

async function putPractice(app, cookie, payload) {
  return app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    cookies: { qwerty_family_session: cookie },
    payload,
  })
}

async function bootstrap(app, cookie) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/sync/bootstrap',
    cookies: { qwerty_family_session: cookie },
  })
  assert.equal(response.statusCode, 200)
  return response.json()
}

test('a record id submitted by one profile never overwrites another profile copy', async (t) => {
  const { app, env } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const alice = await selectProfile(app, 'alice')
  const bob = await selectProfile(app, 'bob')

  // Both members import the same legacy local history, so the record ids collide.
  assert.equal((await putPractice(app, alice.cookie, { wordRecords: [wordRecord({ word: 'alice-word' })] })).statusCode, 200)
  assert.equal(
    (
      await putPractice(app, bob.cookie, {
        wordRecords: [wordRecord({ word: 'bob-word', updatedAt: '2026-04-20T00:00:09.000Z' })],
      })
    ).statusCode,
    200,
  )

  const aliceState = await bootstrap(app, alice.cookie)
  const bobState = await bootstrap(app, bob.cookie)

  assert.equal(aliceState.practice.wordRecords.length, 1)
  assert.equal(aliceState.practice.wordRecords[0].word, 'alice-word', "Bob's write must not reach Alice's row")
  assert.equal(aliceState.practice.wordRecords[0].updatedAt, '2026-04-20T00:00:01.000Z')

  assert.equal(bobState.practice.wordRecords.length, 1)
  assert.equal(bobState.practice.wordRecords[0].word, 'bob-word')
})

test('deleting a profile leaves the other profile practice rows intact', async (t) => {
  const { app, env } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const alice = await selectProfile(app, 'alice')
  await putPractice(app, alice.cookie, { wordRecords: [wordRecord({ word: 'alice-word' })] })

  const bob = await selectProfile(app, 'bob')
  await putPractice(app, bob.cookie, { wordRecords: [wordRecord({ word: 'bob-word' })] })

  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${bob.profile.id}`,
    cookies: { qwerty_family_session: bob.cookie },
    payload: { confirmationText: 'bob' },
  })
  assert.equal(deleteResponse.statusCode, 200)

  const aliceState = await bootstrap(app, alice.cookie)
  assert.equal(aliceState.practice.wordRecords.length, 1)
  assert.equal(aliceState.practice.wordRecords[0].word, 'alice-word')
})

test('the originating device autoincrement id is not persisted for other devices', async (t) => {
  const { app, env } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const alice = await selectProfile(app, 'alice')
  await putPractice(app, alice.cookie, { wordRecords: [wordRecord({ id: 41, word: 'alice-word' })] })

  const aliceState = await bootstrap(app, alice.cookie)
  assert.equal(aliceState.practice.wordRecords.length, 1)
  assert.equal(aliceState.practice.wordRecords[0].word, 'alice-word')
  assert.ok(!('id' in aliceState.practice.wordRecords[0]), 'device-local Dexie id must be stripped before storage')
})
