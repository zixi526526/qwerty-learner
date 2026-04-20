const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.ts'), 'utf8')
const docs = fs.readFileSync(path.join(root, 'docs', 'self-host-family.md'), 'utf8')

test('npm verification scripts are wired for the scaffold lanes', () => {
  assert.equal(packageJson.scripts.test, 'npm run test:unit && npm run test:api && npm run test:db')
  assert.equal(packageJson.scripts['test:unit'], 'node --test tests/unit/*.test.cjs')
  assert.equal(packageJson.scripts['test:api'], 'node --test tests/api/*.test.cjs')
  assert.equal(packageJson.scripts['test:db'], 'node --test tests/db/*.test.cjs')
  assert.equal(
    packageJson.scripts['test:e2e:local'],
    'npm run build && cross-env PLAYWRIGHT_LOCAL=1 playwright test tests/e2e/family-self-hosted.scaffold.spec.js --project=chromium',
  )
  assert.equal(
    packageJson.scripts['start:local-e2e'],
    "node -e \"require('fs').rmSync('.data',{recursive:true,force:true})\" && node server/index.cjs",
  )
})

test('Playwright local mode stays on the one-port local server path', () => {
  assert.match(playwrightConfig, /PLAYWRIGHT_LOCAL === '1'/)
  assert.match(playwrightConfig, /http:\/\/127\.0\.0\.1:4173/)
  assert.match(playwrightConfig, /command: 'npm run start:local-e2e'/)
})

test('self-host family docs include the verification commands', () => {
  assert.match(docs, /npm run build/)
  assert.match(docs, /npm run start:local-e2e/)
  assert.match(docs, /npm run test:e2e:local/)
})
