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
