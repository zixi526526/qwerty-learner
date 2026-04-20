const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildApp } = require('../../server/app.cjs')

function createEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qwerty-family-api-'))
  return {
    root,
    env: {
      FAMILY_DISABLE_STATIC: '1',
      NODE_ENV: 'test',
      QL_DB_PATH: path.join(root, 'family.sqlite'),
    },
  }
}

async function createApp() {
  const { root, env } = createEnv()
  const app = buildApp({ env, logger: false })
  await app.ready()
  return { app, root }
}

function getCookie(response) {
  const header = response.headers['set-cookie']
  const cookie = Array.isArray(header) ? header[0] : header
  return cookie.split(';')[0]
}

test('session selection auto-creates a profile and bootstraps session state', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const select = await app.inject({
    method: 'POST',
    url: '/api/session/select',
    payload: { username: 'FamilyAlpha', displayName: 'Family Alpha', welcomeMessage: 'Welcome home' },
  })
  assert.equal(select.statusCode, 200)
  assert.equal(select.json().profile.normalizedUsername, 'familyalpha')

  const cookie = getCookie(select)
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().profile.username, 'FamilyAlpha')

  const bootstrap = await app.inject({ method: 'GET', url: '/api/sync/bootstrap', headers: { cookie } })
  assert.equal(bootstrap.statusCode, 200)
  assert.deepEqual(bootstrap.json().settings.payload, {})
  assert.deepEqual(bootstrap.json().progress.payload, {})
})

test('profile management endpoints update, export, delete, and guard confirmation', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const created = await app.inject({ method: 'POST', url: '/api/profiles', payload: { username: 'FamilyBeta' } })
  assert.equal(created.statusCode, 201)
  const profileId = created.json().profile.id

  const updated = await app.inject({
    method: 'PATCH',
    url: `/api/profiles/${profileId}`,
    payload: { username: 'FamilyBeta', displayName: 'Beta', welcomeMessage: 'Hi Beta' },
  })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.json().profile.displayName, 'Beta')

  const exported = await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/export` })
  assert.equal(exported.statusCode, 200)
  assert.equal(exported.json().profile.id, profileId)

  const rejectedDelete = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${profileId}`,
    payload: { confirmationText: 'wrong-name' },
  })
  assert.equal(rejectedDelete.statusCode, 400)
  assert.match(rejectedDelete.json().error, /Type FamilyBeta to confirm deletion\./)

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${profileId}`,
    payload: { confirmationText: 'familybeta' },
  })
  assert.equal(deleted.statusCode, 200)
  assert.equal(deleted.json().ok, true)
})

test('sync APIs persist data, surface conflicts, and support explicit migration import', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const select = await app.inject({ method: 'POST', url: '/api/session/select', payload: { username: 'FamilyGamma' } })
  const cookie = getCookie(select)

  const settings = await app.inject({
    method: 'PUT',
    url: '/api/sync/settings',
    headers: { cookie },
    payload: { baseRevision: 0, payload: { currentDict: 'cet4' } },
  })
  assert.equal(settings.statusCode, 200)
  assert.equal(settings.json().settings.revision, 1)

  const conflict = await app.inject({
    method: 'PUT',
    url: '/api/sync/settings',
    headers: { cookie },
    payload: { baseRevision: 0, payload: { currentDict: 'cet6' } },
  })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.json().current.revision, 1)

  const imported = await app.inject({
    method: 'POST',
    url: '/api/migrations/import-local',
    headers: { cookie },
    payload: {
      settingsPayload: { currentDict: 'ielts' },
      progressPayload: { chapterRecords: [{ dict: 'ielts', chapter: 2 }] },
    },
  })
  assert.equal(imported.statusCode, 200)
  assert.equal(imported.json().settings.payload.currentDict, 'ielts')
  assert.equal(imported.json().progress.payload.chapterRecords[0].chapter, 2)
})


test('unauthorized sync endpoints reject requests without a selected family profile', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const bootstrap = await app.inject({ method: 'GET', url: '/api/sync/bootstrap' })
  assert.equal(bootstrap.statusCode, 401)
  assert.match(bootstrap.json().error, /Select a family profile first/)

  const importLocal = await app.inject({
    method: 'POST',
    url: '/api/migrations/import-local',
    payload: { settingsPayload: {}, progressPayload: {} },
  })
  assert.equal(importLocal.statusCode, 401)
})

test('invalid usernames are rejected and logout clears the active session', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const invalidProfile = await app.inject({
    method: 'POST',
    url: '/api/profiles',
    payload: { username: '!bad-name' },
  })
  assert.equal(invalidProfile.statusCode, 400)

  const select = await app.inject({
    method: 'POST',
    url: '/api/session/select',
    payload: { username: 'FamilyLogout' },
  })
  assert.equal(select.statusCode, 200)
  const cookie = getCookie(select)

  const logout = await app.inject({
    method: 'POST',
    url: '/api/session/logout',
    headers: { cookie },
  })
  assert.equal(logout.statusCode, 200)

  const meAfterLogout = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  assert.equal(meAfterLogout.statusCode, 200)
  assert.equal(meAfterLogout.json().profile, null)
})
