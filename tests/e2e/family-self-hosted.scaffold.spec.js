const { test } = require('@playwright/test')

const e2eScenarios = [
  'first-use profile creation',
  'cross-device sync convergence',
  'same-device profile isolation',
  'profile management updates the selector state',
  'legacy local-only migration into the chosen profile',
  'stale revision conflict handling',
  'typing, analysis, gallery, and error-book regression coverage',
]

test.describe('Family multi-user verification scaffold', () => {
  for (const scenario of e2eScenarios) {
    test.fixme(`scaffold: ${scenario}`, () => Promise.resolve())
  }
})
