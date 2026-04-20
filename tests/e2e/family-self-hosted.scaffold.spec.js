const { test, expect } = require('@playwright/test')

const pendingScenarios = [
  'cross-device sync convergence',
  'same-device profile isolation',
  'profile management updates the selector state',
  'legacy local-only migration into the chosen profile',
  'stale revision conflict handling',
  'typing, analysis, gallery, and error-book regression coverage',
]

test.describe('Family multi-user verification scaffold', () => {
  test('first-use profile creation reaches the integrated typing shell @family-local', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /choose a family profile/i })).toBeVisible()
    await page.getByLabel('Username').fill('FamilyAlpha')
    await page.getByLabel('Display name').fill('Family Alpha')
    await page.getByLabel('Welcome message').fill('Ready to type together')
    await page.getByRole('button', { name: /create and select/i }).click()

    await expect(page.getByText('Server session')).toBeVisible()
    await expect(page.getByText('@familyalpha')).toBeVisible()
    await expect(page.getByText('Ready to type together')).toBeVisible()
    await expect(page.getByRole('button', { name: /manage profiles/i })).toBeVisible()
  })

  for (const scenario of pendingScenarios) {
    test.fixme(`scaffold: ${scenario}`, () => Promise.resolve())
  }
})
