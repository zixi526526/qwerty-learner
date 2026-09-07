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

  const created = await app.inject({ method: 'POST', url: '/api/session/select', payload: { username: 'FamilyBeta' } })
  assert.equal(created.statusCode, 200)
  const profileId = created.json().profile.id
  const cookie = created.cookies.find((candidate) => candidate.name === 'qwerty_family_session')
  assert.ok(cookie)
  const cookies = { qwerty_family_session: cookie.value }

  const updated = await app.inject({
    method: 'PATCH',
    url: `/api/profiles/${profileId}`,
    cookies,
    payload: { username: 'FamilyBeta', displayName: 'Beta', welcomeMessage: 'Hi Beta' },
  })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.json().profile.displayName, 'Beta')

  const exported = await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/export`, cookies })
  assert.equal(exported.statusCode, 200)
  assert.equal(exported.json().profile.id, profileId)

  const rejectedDelete = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${profileId}`,
    cookies,
    payload: { confirmationText: 'wrong-name' },
  })
  assert.equal(rejectedDelete.statusCode, 400)
  assert.match(rejectedDelete.json().error, /Type FamilyBeta to confirm deletion\./)

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/profiles/${profileId}`,
    cookies,
    payload: { confirmationText: 'familybeta' },
  })
  assert.equal(deleted.statusCode, 200)
  assert.equal(deleted.json().ok, true)
})

test('profile management endpoints reject callers without a session for that profile', async (t) => {
  const { app, root } = await createApp()
  t.after(async () => {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const owner = await app.inject({ method: 'POST', url: '/api/session/select', payload: { username: 'owner' } })
  const ownerId = owner.json().profile.id

  const intruder = await app.inject({ method: 'POST', url: '/api/session/select', payload: { username: 'intruder' } })
  const intruderCookie = intruder.cookies.find((candidate) => candidate.name === 'qwerty_family_session')
  const intruderCookies = { qwerty_family_session: intruderCookie.value }

  // No session at all.
  assert.equal((await app.inject({ method: 'GET', url: `/api/profiles/${ownerId}/export` })).statusCode, 401)
  assert.equal(
    (await app.inject({ method: 'DELETE', url: `/api/profiles/${ownerId}`, payload: { confirmationText: 'owner' } })).statusCode,
    401,
  )
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/profiles/${ownerId}`, payload: { username: 'renamed' } })).statusCode, 401)

  // Signed in, but as somebody else.
  assert.equal((await app.inject({ method: 'GET', url: `/api/profiles/${ownerId}/export`, cookies: intruderCookies })).statusCode, 403)
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/profiles/${ownerId}`,
        cookies: intruderCookies,
        payload: { confirmationText: 'owner' },
      })
    ).statusCode,
    403,
  )
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: `/api/profiles/${ownerId}`,
        cookies: intruderCookies,
        payload: { username: 'renamed' },
      })
    ).statusCode,
    403,
  )

  // The owner's profile survived every attempt.
  const list = await app.inject({ method: 'GET', url: '/api/profiles' })
  assert.ok(list.json().profiles.some((profile) => profile.id === ownerId && profile.username === 'owner'))
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

  const practice = await app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    headers: { cookie },
    payload: {
      wordRecords: [
        {
          recordId: 'word-gamma-1',
          updatedAt: '2026-04-20T00:00:00.000Z',
          word: 'gamma',
          timeStamp: 1,
          dict: 'cet4',
          chapter: 0,
          timing: [100, 110],
          wrongCount: 0,
          mistakes: {},
        },
      ],
    },
  })
  assert.equal(practice.statusCode, 200)
  assert.equal(practice.json().practice.wordRecords[0].recordId, 'word-gamma-1')

  const imported = await app.inject({
    method: 'POST',
    url: '/api/migrations/import-local',
    headers: { cookie },
    payload: {
      settingsPayload: { currentDict: 'ielts' },
      progressPayload: { chapterRecords: [{ dict: 'ielts', chapter: 2 }] },
      practicePayload: {
        reviewRecords: [
          {
            recordId: 'review-imported',
            updatedAt: '2026-04-20T00:00:01.000Z',
            dict: 'ielts',
            index: 1,
            createTime: 2,
            isFinished: false,
            words: [{ name: 'hello' }],
          },
        ],
      },
    },
  })
  assert.equal(imported.statusCode, 200)
  assert.equal(imported.json().settings.payload.currentDict, 'ielts')
  assert.equal(imported.json().progress.payload.chapterRecords[0].chapter, 2)
  assert.equal(imported.json().practice.reviewRecords[0].recordId, 'review-imported')
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

  const practice = await app.inject({
    method: 'PUT',
    url: '/api/sync/practice',
    payload: { wordRecords: [] },
  })
  assert.equal(practice.statusCode, 401)

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
