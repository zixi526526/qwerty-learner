const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { apiScenarios } = require('../contracts/family-multi-user.contract.cjs')

const docs = fs.readFileSync(path.resolve(__dirname, '..', '..', 'docs', 'self-host-family.md'), 'utf8')

test('API scaffold tracks the expected family multi-user endpoints', () => {
  assert.equal(apiScenarios.length, 10)
  assert.ok(apiScenarios.some((scenario) => scenario.includes('POST /api/session/select')))
  assert.ok(apiScenarios.some((scenario) => scenario.includes('GET /api/profiles')))
  assert.ok(apiScenarios.some((scenario) => scenario.includes('PUT /api/sync/progress')))
})

test('docs enumerate the same-origin API surface for self-hosting', () => {
  assert.match(docs, /\/api\/session\/select/)
  assert.match(docs, /\/api\/profiles/)
  assert.match(docs, /\/api\/sync\/bootstrap/)
})
