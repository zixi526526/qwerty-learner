const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { dbScenarios } = require('../contracts/family-multi-user.contract.cjs')

const docs = fs.readFileSync(path.resolve(__dirname, '..', '..', 'docs', 'self-host-family.md'), 'utf8')

test('database scaffold tracks the required isolation and backup checks', () => {
  assert.equal(dbScenarios.length, 6)
  assert.ok(dbScenarios.some((scenario) => scenario.includes('unique')))
  assert.ok(dbScenarios.some((scenario) => scenario.includes('isolated by profile_id')))
  assert.ok(dbScenarios.some((scenario) => scenario.includes('backed up or rolled back')))
})

test('self-host docs describe SQLite-backed one-port runtime assumptions', () => {
  assert.match(docs, /SQLite/)
  assert.match(docs, /single-port Node server/)
  assert.match(docs, /127\.0\.0\.1:4173/)
})
