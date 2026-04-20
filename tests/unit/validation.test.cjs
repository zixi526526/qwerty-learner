const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  MAX_WELCOME_LENGTH,
  normalizeUsername,
  sanitizeDisplayName,
  sanitizeWelcomeMessage,
  validateUsername,
} = require('../../server/lib/validation.cjs')

test('validateUsername normalizes allowed usernames', () => {
  const result = validateUsername('  Family_One  ')
  assert.equal(result.ok, true)
  assert.equal(result.trimmed, 'Family_One')
  assert.equal(result.normalized, 'family_one')
})

test('validateUsername rejects blank or malformed usernames', () => {
  assert.equal(validateUsername('').ok, false)
  assert.equal(validateUsername('!bad-name').ok, false)
  assert.equal(validateUsername('a').ok, false)
})

test('display and welcome sanitizers trim and cap user-facing text', () => {
  assert.equal(sanitizeDisplayName('   ', 'FallbackName'), 'FallbackName')
  assert.equal(sanitizeDisplayName('  Family Name  ', 'FallbackName'), 'Family Name')

  const welcome = sanitizeWelcomeMessage(`  ${'x'.repeat(MAX_WELCOME_LENGTH + 20)}  `)
  assert.equal(welcome.length, MAX_WELCOME_LENGTH)
  assert.equal(normalizeUsername('  MixedCase-User  '), 'mixedcase-user')
})
