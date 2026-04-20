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
    QL_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-api-')),
  }
}

async function createApp() {
  const env = createEnv()
  const app = buildApp({ env, logger: false })
  await app.ready()
  return { app, env }
}

test('server flow supports session select, bootstrap, sync, export, and profile management', async (t) => {
  const { app, env } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const selectResponse = await app.inject({
    method: 'POST',
    url: '/api/session/select',
    payload: {
      username: 'alice-verifier',
      displayName: 'Alice Verifier',
      welcomeMessage: 'Ready to verify',
    },
  })

  assert.equal(selectResponse.statusCode, 200)
  const sessionCookie = selectResponse.cookies.find((cookie) => cookie.name === 'qwerty_family_session')
  assert.ok(sessionCookie)
  const activeProfile = selectResponse.json().profile
  assert.equal(activeProfile.username, 'alice-verifier')

  const bootstrapResponse = await app.inject({
    method: 'GET',
    url: '/api/sync/bootstrap',
    cookies: { qwerty_family_session: sessionCookie.value },
  })
  assert.equal(bootstrapResponse.statusCode, 200)
  const bootstrap = bootstrapResponse.json()
  assert.equal(bootstrap.profile.username, 'alice-verifier')
  assert.equal(bootstrap.settings.revision, 0)
  assert.equal(bootstrap.progress.revision, 0)
  assert.deepEqual(bootstrap.practice.wordRecords, [])
  assert.deepEqual(bootstrap.practice.chapterRecords, [])
  assert.deepEqual(bootstrap.practice.reviewRecords, [])

  const settingsResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/settings',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: {
      baseRevision: 0,
      payload: { theme: 'dark', sound: true },
    },
  })
  assert.equal(settingsResponse.statusCode, 200)
  assert.equal(settingsResponse.json().settings.revision, 1)

  const progressResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/progress',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: {
      baseRevision: 0,
      payload: { chapter: 3, accuracy: 98 },
    },
  })
  assert.equal(progressResponse.statusCode, 200)
  assert.equal(progressResponse.json().progress.revision, 1)

  const practicePayload = {
    wordRecords: [
      {
        recordId: 'word-1',
        updatedAt: '2026-04-20T00:00:00.000Z',
        word: 'alpha',
        timeStamp: 100,
        dict: 'cet4',
        chapter: 0,
        timing: [120, 110],
        wrongCount: 1,
        mistakes: { 0: ['q'] },
      },
    ],
    chapterRecords: [
      {
        recordId: 'chapter-1',
        updatedAt: '2026-04-20T00:00:01.000Z',
        dict: 'cet4',
        chapter: 0,
        timeStamp: 101,
        time: 30,
        correctCount: 20,
        wrongCount: 1,
        wordCount: 20,
        correctWordIndexes: [0, 1],
        wordNumber: 20,
        wordRecordIds: [1],
      },
    ],
    reviewRecords: [
      {
        recordId: 'review-1',
        updatedAt: '2026-04-20T00:00:02.000Z',
        dict: 'cet4',
        index: 3,
        createTime: 102,
        isFinished: false,
        words: [{ name: 'alpha' }],
      },
    ],
  }

  const practiceResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: practicePayload,
  })
  assert.equal(practiceResponse.statusCode, 200)
  assert.equal(practiceResponse.json().practice.wordRecords[0].recordId, 'word-1')

  const conflictResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/progress',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: {
      baseRevision: 0,
      payload: { chapter: 4 },
    },
  })
  assert.equal(conflictResponse.statusCode, 409)
  assert.equal(conflictResponse.json().error, 'Progress conflict')

  const exportResponse = await app.inject({
    method: 'GET',
    url: `/api/profiles/${activeProfile.id}/export`,
  })
  assert.equal(exportResponse.statusCode, 200)
  const exportPayload = exportResponse.json()
  assert.equal(exportPayload.profile.username, 'alice-verifier')
  assert.deepEqual(exportPayload.settings.payload, { theme: 'dark', sound: true })
  assert.deepEqual(exportPayload.progress.payload, { chapter: 3, accuracy: 98 })
  assert.equal(exportPayload.practice.wordRecords[0].recordId, 'word-1')

  const secondProfileResponse = await app.inject({
    method: 'POST',
    url: '/api/profiles',
    payload: {
      username: 'bob-verifier',
      displayName: 'Bob Verifier',
      welcomeMessage: 'Bob is ready',
    },
  })
  assert.equal(secondProfileResponse.statusCode, 201)
  const secondProfile = secondProfileResponse.json().profile

  const wrongDeleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${secondProfile.id}`,
    payload: { confirmationText: 'wrong' },
  })
  assert.equal(wrongDeleteResponse.statusCode, 400)

  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${secondProfile.id}`,
    payload: { confirmationText: 'bob-verifier' },
  })
  assert.equal(deleteResponse.statusCode, 200)
  assert.equal(deleteResponse.json().ok, true)

  const profileListResponse = await app.inject({
    method: 'GET',
    url: '/api/profiles',
  })
  assert.equal(profileListResponse.statusCode, 200)
  assert.equal(profileListResponse.json().profiles.length, 1)
  assert.equal(profileListResponse.json().profiles[0].username, 'alice-verifier')
})

test('practice sync keeps the newest copy when the same record arrives twice', async (t) => {
  const { app, env } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(env.QL_DATA_DIR, { recursive: true, force: true })
  })

  const selectResponse = await app.inject({
    method: 'POST',
    url: '/api/session/select',
    payload: {
      username: 'practice-conflict',
    },
  })

  const sessionCookie = selectResponse.cookies.find((cookie) => cookie.name === 'qwerty_family_session')
  assert.ok(sessionCookie)

  const newerRecord = {
    recordId: 'word-conflict-1',
    updatedAt: '2026-04-20T00:00:05.000Z',
    word: 'newer',
    timeStamp: 5,
    dict: 'cet4',
    chapter: 0,
    timing: [100],
    wrongCount: 0,
    mistakes: {},
  }

  const olderRecord = {
    ...newerRecord,
    updatedAt: '2026-04-20T00:00:01.000Z',
    word: 'older',
  }

  const newerResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: { wordRecords: [newerRecord] },
  })
  assert.equal(newerResponse.statusCode, 200)

  const olderResponse = await app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    cookies: { qwerty_family_session: sessionCookie.value },
    payload: { wordRecords: [olderRecord] },
  })
  assert.equal(olderResponse.statusCode, 200)

  const bootstrapResponse = await app.inject({
    method: 'GET',
    url: '/api/sync/bootstrap',
    cookies: { qwerty_family_session: sessionCookie.value },
  })
  assert.equal(bootstrapResponse.statusCode, 200)
  assert.equal(bootstrapResponse.json().practice.wordRecords[0].word, 'newer')
  assert.equal(bootstrapResponse.json().practice.wordRecords[0].updatedAt, '2026-04-20T00:00:05.000Z')
})
