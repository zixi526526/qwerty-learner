import { expect, test } from '@playwright/test'

test.describe('Family self-hosted integration', () => {
  test('creates, restores, switches, and manages family profiles on the local one-port server', async ({ page }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `alice${unique}`
    const bobUsername = `bob${unique}`

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Choose a family profile' })).toBeVisible()

    await page.getByLabel('Username').fill(aliceUsername)
    await page.getByLabel('Display name').fill('Alice Verifier')
    await page.getByLabel('Welcome message').fill('Ready to verify Alice')
    await page.getByRole('button', { name: 'Create and select' }).click()

    await expect(page.getByText('Server session')).toBeVisible()
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()
    await expect(page.getByText('Ready to verify Alice')).toBeVisible()

    await page.reload()
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()

    await page.getByLabel('Username').fill(bobUsername)
    await page.getByLabel('Display name').fill('Bob Verifier')
    await page.getByLabel('Welcome message').fill('Ready to verify Bob')
    await page.getByRole('button', { name: 'Create and select' }).click()
    await expect(page.getByText(`Bob Verifier · @${bobUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()
    const aliceCard = page
      .getByText(`@${aliceUsername}`)
      .locator('xpath=ancestor::div[.//button[normalize-space()="Switch"]][1]')
    await aliceCard.getByRole('button', { name: 'Switch' }).click()
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()
    await expect(page.getByText(`@${bobUsername}`)).toBeVisible()
  })
})
