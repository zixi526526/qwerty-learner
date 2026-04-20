const fs = require('node:fs')
const path = require('node:path')
const Fastify = require('fastify')
const fastifyCookie = require('@fastify/cookie')
const fastifyStatic = require('@fastify/static')
const { openDatabase, getDatabasePath } = require('./lib/db.cjs')
const {
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
} = require('./lib/store.cjs')
const { listPracticeRecords, upsertPracticeRecords } = require('./lib/practice-store.cjs')
const {
  sanitizeDisplayName,
  sanitizeWelcomeMessage,
  validateUsername,
} = require('./lib/validation.cjs')

const COOKIE_NAME = 'qwerty_family_session'

function buildApp(options = {}) {
  const db = options.db || openDatabase(options.env)
  const env = options.env || process.env
  const buildDir = path.join(process.cwd(), 'build')
  const app = Fastify({ logger: options.logger ?? false })

  app.register(fastifyCookie, {
    secret: env.FAMILY_COOKIE_SECRET || 'dev-family-secret-change-me',
  })

  app.decorate('familyDb', db)

  app.decorateRequest('familySession', null)

  app.addHook('onRequest', async (request) => {
    const sessionId = request.cookies[COOKIE_NAME]
    if (!sessionId) return
    const session = getSession(db, sessionId)
    if (!session) return
    touchSession(db, sessionId)
    request.familySession = session
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: 'Invalid request.', details: error.validation })
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.status(409).send({ error: 'That username is already in use.' })
    }
    requestLog(app, error)
    return reply.status(500).send({ error: 'Unexpected server error.' })
  })

  app.get('/api/health', async () => ({ ok: true, databasePath: getDatabasePath(env) }))

  app.get('/api/profiles', async () => ({ profiles: listProfiles(db) }))

  app.post('/api/profiles', async (request, reply) => {
    const validation = validateUsername(request.body?.username)
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.message })
    }

    const profile = createProfile(db, {
      username: validation.trimmed,
      normalizedUsername: validation.normalized,
      displayName: sanitizeDisplayName(request.body?.displayName, validation.trimmed),
      welcomeMessage: sanitizeWelcomeMessage(request.body?.welcomeMessage),
    })

    return reply.status(201).send({ profile })
  })

  app.patch('/api/profiles/:id', async (request, reply) => {
    const validation = validateUsername(request.body?.username)
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.message })
    }

    const profile = updateProfile(db, Number(request.params.id), {
      username: validation.trimmed,
      normalizedUsername: validation.normalized,
      displayName: sanitizeDisplayName(request.body?.displayName, validation.trimmed),
      welcomeMessage: sanitizeWelcomeMessage(request.body?.welcomeMessage),
    })

    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found.' })
    }

    return { profile }
  })

  app.get('/api/profiles/:id/export', async (request, reply) => {
    const bundle = exportProfileBundle(db, Number(request.params.id))
    if (!bundle) {
      return reply.status(404).send({ error: 'Profile not found.' })
    }
    reply.header('content-disposition', `attachment; filename="${bundle.profile.username}-backup.json"`)
    return {
      ...bundle,
      practice: listPracticeRecords(db, bundle.profile.id),
    }
  })

  app.delete('/api/profiles/:id', async (request, reply) => {
    const profile = getProfileById(db, Number(request.params.id))
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found.' })
    }

    const confirmationText = String(request.body?.confirmationText ?? '').trim().toLowerCase()
    if (confirmationText !== profile.normalizedUsername) {
      return reply.status(400).send({ error: `Type ${profile.username} to confirm deletion.` })
    }

    deleteProfile(db, profile.id)

    if (request.familySession?.profileId === profile.id) {
      reply.clearCookie(COOKIE_NAME, { path: '/' })
    }

    return { ok: true }
  })

  app.post('/api/session/select', async (request, reply) => {
    const validation = validateUsername(request.body?.username)
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.message })
    }

    const profile =
      getProfileByUsername(db, validation.normalized) ||
      createProfile(db, {
        username: validation.trimmed,
        normalizedUsername: validation.normalized,
        displayName: sanitizeDisplayName(request.body?.displayName, validation.trimmed),
        welcomeMessage: sanitizeWelcomeMessage(request.body?.welcomeMessage),
      })

    if (request.cookies[COOKIE_NAME]) {
      destroySession(db, request.cookies[COOKIE_NAME])
    }

    const sessionId = createSession(db, profile.id)
    reply.setCookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: env.NODE_ENV === 'production',
      signed: false,
    })

    return { profile: getProfileById(db, profile.id) }
  })

  app.post('/api/session/logout', async (request, reply) => {
    if (request.cookies[COOKIE_NAME]) {
      destroySession(db, request.cookies[COOKIE_NAME])
    }
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return { ok: true }
  })

  app.get('/api/me', async (request) => {
    return { profile: requestProfile(request) }
  })

  app.get('/api/sync/bootstrap', async (request, reply) => {
    const profile = requireSession(request, reply)
    if (!profile) return

    return {
      profile,
      settings: getDocument(db, SETTINGS_TABLE, profile.id),
      progress: getDocument(db, PROGRESS_TABLE, profile.id),
      practice: listPracticeRecords(db, profile.id),
    }
  })

  app.put('/api/sync/settings', async (request, reply) => {
    const profile = requireSession(request, reply)
    if (!profile) return

    try {
      const settings = saveDocument(db, SETTINGS_TABLE, profile.id, Number(request.body?.baseRevision ?? 0), request.body?.payload ?? {})
      return { settings }
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') {
        return reply.status(409).send({ error: 'Settings conflict', current: error.current })
      }
      throw error
    }
  })

  app.put('/api/sync/progress', async (request, reply) => {
    const profile = requireSession(request, reply)
    if (!profile) return

    try {
      const progress = saveDocument(db, PROGRESS_TABLE, profile.id, Number(request.body?.baseRevision ?? 0), request.body?.payload ?? {})
      return { progress }
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') {
        return reply.status(409).send({ error: 'Progress conflict', current: error.current })
      }
      throw error
    }
  })

  app.put('/api/sync/practice', async (request, reply) => {
    const profile = requireSession(request, reply)
    if (!profile) return

    const practice = upsertPracticeRecords(db, profile.id, request.body ?? {})
    return { practice }
  })

  app.post('/api/migrations/import-local', async (request, reply) => {
    const profile = requireSession(request, reply)
    if (!profile) return

    const settings = saveDocument(db, SETTINGS_TABLE, profile.id, 0, request.body?.settingsPayload ?? {}, { force: true })
    const progress = saveDocument(db, PROGRESS_TABLE, profile.id, 0, request.body?.progressPayload ?? {}, { force: true })
    const practice = upsertPracticeRecords(db, profile.id, request.body?.practicePayload ?? {})
    return { profile, settings, progress, practice }
  })

  if (env.FAMILY_DISABLE_STATIC !== '1' && fs.existsSync(buildDir)) {
    app.register(fastifyStatic, {
      root: path.join(buildDir, 'assets'),
      prefix: '/assets/',
      wildcard: false,
      decorateReply: false,
    })

    app.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found.' })
      }
      return reply.type('text/html').send(fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8'))
    })
  }

  return app
}

function requestProfile(request) {
  return request.familySession?.profile ?? null
}

function requireSession(request, reply) {
  const profile = requestProfile(request)
  if (!profile) {
    reply.status(401).send({ error: 'Select a family profile first.' })
    return null
  }
  return profile
}

function requestLog(app, error) {
  if (app.log && typeof app.log.error === 'function') {
    app.log.error(error)
  } else {
    console.error(error)
  }
}

module.exports = {
  COOKIE_NAME,
  buildApp,
}
