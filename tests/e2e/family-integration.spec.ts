import { expect, test } from '@playwright/test'

test.describe('Family self-hosted integration', () => {
  test('creates, restores, switches, and manages family profiles on the local one-port server', async ({ page }) => {
    const findProfileAction = (username: string, actionLabel: 'Delete' | 'Edit' | 'Switch') =>
      page
        .locator('span')
        .filter({ hasText: `@${username}` })
        .locator(`xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="${actionLabel}"]`)
        .first()
    const clickProfileAction = async (username: string, actionLabel: 'Delete' | 'Edit' | 'Switch') => {
      await findProfileAction(username, actionLabel).evaluate((button) => {
        ;(button as HTMLButtonElement).click()
      })
    }

    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `alice${unique}`
    const bobUsername = `bob${unique}`

    await page.setViewportSize({ width: 1440, height: 1600 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Choose a family profile' })).toBeVisible()

    await page.getByLabel('Username').fill(aliceUsername)
    await page.getByLabel('Display name').fill('Alice Verifier')
    await page.getByLabel('Welcome message').fill('Ready to verify Alice')
    await page.getByRole('button', { name: 'Create and select' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })

    await expect(page.getByText('Server session')).toBeVisible()
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()
    await expect(page.getByText('Ready to verify Alice')).toBeVisible()

    await page.reload()
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()

    await page.getByLabel('Username').fill(bobUsername)
    await page.getByLabel('Display name').fill('Bob Verifier')
    await page.getByLabel('Welcome message').fill('Ready to verify Bob')
    await page.getByRole('button', { name: 'Create and select' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByText(`Bob Verifier · @${bobUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()
    await clickProfileAction(bobUsername, 'Edit')
    await page.getByLabel('Display name').fill('Bob Updated')
    await page.getByLabel('Welcome message').fill('Updated welcome for Bob')
    await page.getByRole('button', { name: 'Save profile' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByText(`Bob Updated · @${bobUsername}`)).toBeVisible()
    await expect(page.getByText('Updated welcome for Bob')).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()
    await clickProfileAction(aliceUsername, 'Switch')
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()

    await page.getByRole('button', { name: 'Manage profiles' }).click()
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`Type ${bobUsername} to delete this family profile.`)
      await dialog.accept(bobUsername)
    })
    await clickProfileAction(bobUsername, 'Delete')
    await expect(page.getByText(`@${bobUsername}`)).toHaveCount(0)
    await page.getByRole('button', { name: 'Close' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByText(`Alice Verifier · @${aliceUsername}`)).toBeVisible()
    await expect(page.getByText(`@${bobUsername}`)).toHaveCount(0)
  })
})
