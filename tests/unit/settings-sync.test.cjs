const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Execute the client module with real scoped storage keys and controlled browser
// timers/network. Assertions inspect the actual serialized PUT bodies.
function harness() {
  const values = new Map()
  const timers = new Map()
  const requests = []
  const errors = []
  let timerId = 0
  const sandbox = vm.createContext({
    window: {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: (id) => timers.delete(id),
    },
    console: { error: (error) => errors.push(error) },
    fetch: (_url, options) =>
      new Promise((resolve) => {
        requests.push({
          body: JSON.parse(options.body),
          respond: (status, body) => resolve({ status, ok: status === 200, json: async () => body }),
        })
      }),
  })
  const modules = {}
  function load(name) {
    if (modules[name]) return modules[name].exports
    const module = { exports: {} }
    modules[name] = module
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/family', `${name}.ts`), 'utf8')
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
    const run = vm.runInContext(`(function(require, module, exports) { ${outputText}\n})`, sandbox)
    run((id) => load(id.replace('./', '')), module, module.exports)
    return module.exports
  }
  const api = load('settingsSync')
  const storage = load('storage')
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  return {
    ...api,
    requests,
    timers,
    errors,
    settle,
    configure(namespace = 'a', payload = { fontsize: 16, currentDict: 'OLD' }) {
      api.configureSettingsSync({ enabled: true, namespace, settings: { revision: 1, payload } })
    },
    set(key, value, namespace = 'a', queue = true) {
      const scoped = storage.getProfileScopedStorageKey(key, namespace)
      if (value === undefined) values.delete(scoped)
      else values.set(scoped, JSON.stringify(value))
      if (queue) api.queueSettingsSyncForKey(key)
    },
    async tick() {
      const entry = timers.entries().next().value
      assert.ok(entry, 'expected a pending sync timer')
      timers.delete(entry[0])
      entry[1]()
      await settle()
    },
    async conflict(index = 0) {
      requests[index].respond(409, { current: { revision: 2, payload: { fontsize: 16, currentDict: 'CET4' } } })
      await settle()
    },
    async succeed(index) {
      requests[index].respond(200, { settings: { revision: index + 3, payload: requests[index].body.payload } })
      await settle()
    },
  }
}

test('409 retry preserves server-only fields and local edits in the second PUT', async () => {
  const h = harness()
  h.configure('a', { fontsize: 16 })
  h.set('fontsize', 20)
  await h.tick()
  assert.deepEqual(h.requests[0].body, { baseRevision: 1, payload: { fontsize: 20 } })
  await h.conflict()
  await h.tick()
  assert.deepEqual(h.requests[1].body, { baseRevision: 2, payload: { fontsize: 20, currentDict: 'CET4' } })
  await h.succeed(1)
  assert.equal(h.timers.size, 0)
})

test('unchanged stale local fields do not overwrite server changes', async () => {
  const h = harness()
  h.configure()
  h.set('currentDict', 'OLD', 'a', false)
  h.set('fontsize', 20)
  await h.tick()
  await h.conflict()
  await h.tick()
  assert.deepEqual(h.requests[1].body.payload, { fontsize: 20, currentDict: 'CET4' })
})

test('edits during the request and retry delay are included in the retry', async () => {
  const h = harness()
  h.configure()
  h.set('fontsize', 20)
  await h.tick()
  h.set('currentChapter', 3)
  assert.equal(h.timers.size, 0)
  await h.conflict()
  h.set('fontsize', 24)
  await h.tick()
  assert.deepEqual(h.requests[1].body.payload, { fontsize: 24, currentDict: 'CET4', currentChapter: 3 })
  // A newer same-key edit must survive completion of the retry.
  h.set('fontsize', 28)
  await h.succeed(1)
  await h.tick()
  assert.deepEqual(h.requests[2].body, {
    baseRevision: 4,
    payload: { fontsize: 28, currentDict: 'CET4', currentChapter: 3 },
  })
  await h.succeed(2)
  assert.equal(h.timers.size, 0)
})

test('local removal is retained across a conflict', async () => {
  const h = harness()
  h.configure()
  h.set('fontsize', undefined)
  await h.tick()
  await h.conflict()
  await h.tick()
  assert.deepEqual(h.requests[1].body.payload, { currentDict: 'CET4' })
})

test('repeated conflicts stop after one automatic retry, retaining edits for later', async () => {
  const h = harness()
  h.configure()
  h.set('fontsize', 20)
  await h.tick()
  await h.conflict()
  await h.tick()
  h.set('currentChapter', 5)
  await h.conflict(1)
  assert.equal(h.requests.length, 2)
  assert.equal(h.timers.size, 0)
  assert.equal(h.errors.length, 1)
  h.set('fontsize', 24)
  await h.tick()
  assert.deepEqual(h.requests[2].body.payload, { fontsize: 24, currentDict: 'CET4', currentChapter: 5 })
})

test('profile switching cancels a pending conflict retry', async () => {
  const h = harness()
  h.configure()
  h.set('fontsize', 20)
  await h.tick()
  await h.conflict()
  h.configure('b', { currentDict: 'B' })
  assert.equal(h.timers.size, 0)
  h.set('fontsize', 30, 'b')
  await h.tick()
  assert.deepEqual(h.requests[1].body, { baseRevision: 1, payload: { currentDict: 'B', fontsize: 30 } })
})

for (const status of [200, 409, 500]) {
  test(`ignores an old profile's in-flight ${status} response`, async () => {
    const h = harness()
    h.configure()
    h.set('fontsize', 20)
    await h.tick()
    h.configure('b', { currentDict: 'B' })
    h.set('fontsize', 30, 'b')
    h.requests[0].respond(status, {
      settings: { revision: 99, payload: { fontsize: 20 } },
      current: { revision: 99, payload: { currentDict: 'A' } },
    })
    await h.settle()
    await h.tick()
    assert.deepEqual(h.requests[1].body, { baseRevision: 1, payload: { currentDict: 'B', fontsize: 30 } })
    assert.equal(h.errors.length, 0)
  })
}

test('disabling sync invalidates in-flight requests and pending timers', async () => {
  const h = harness()
  h.configure()
  h.set('fontsize', 20)
  await h.tick()
  h.configureSettingsSync({ enabled: false, namespace: null })
  await h.conflict()
  assert.equal(h.timers.size, 0)
  h.configure()
  h.set('fontsize', 24)
  await h.tick()
  assert.equal(h.requests[1].body.baseRevision, 1)
})
