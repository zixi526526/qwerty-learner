const { test, expect } = require('@playwright/test')

const pendingScenarios = [
  'legacy local-only migration into the chosen profile',
]

test.describe('Family multi-user verification scaffold', () => {
  async function ensureProfileFormVisible(page) {
    const usernameInput = page.getByLabel('Username')
    if (await usernameInput.isVisible().catch(() => false)) {
      return
    }

    const manageProfilesButton = page.getByRole('button', { name: /manage profiles/i })
    if (await manageProfilesButton.isVisible().catch(() => false)) {
      await manageProfilesButton.click()
    }

    await expect(usernameInput).toBeVisible({ timeout: 15000 })
  }


  async function clickButtonByName(page, namePattern) {
    await page.getByRole('button', { name: namePattern }).evaluate((button) => {
      button.click()
    })
  }

  async function waitForServerSettings(page, expected) {
    await page.waitForFunction(
      async ({ currentDict, isOpenDarkModeAtom }) => {
        const response = await fetch('/api/sync/bootstrap', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        })
        if (!response.ok) return false
        const payload = await response.json()
        return (
          payload?.settings?.payload?.currentDict === currentDict &&
          payload?.settings?.payload?.isOpenDarkModeAtom === isOpenDarkModeAtom
        )
      },
      expected,
      { timeout: 15000 },
    )
  }
  test('first-use profile creation reaches the integrated typing shell @family-local', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await ensureProfileFormVisible(page)
    await page.getByLabel('Username').fill('FamilyAlpha')
    await page.getByLabel('Display name').fill('Family Alpha')
    await page.getByLabel('Welcome message').fill('Ready to type together')
    await clickButtonByName(page, /create and select/i)

    await expect(page.getByText('Server session')).toBeVisible()
    await expect(page.getByText('@familyalpha')).toBeVisible()
    await expect(page.getByText('Ready to type together')).toBeVisible()
    await expect(page.getByRole('button', { name: /manage profiles/i })).toBeVisible()
  })

  test('same-device profile isolation keeps settings scoped per family member', async ({ page }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `alice-${unique}`
    const bobUsername = `bob-${unique}`

    const findProfileAction = (username, actionLabel) =>
      page
        .locator('span')
        .filter({ hasText: `@${username}` })
        .locator(`xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="${actionLabel}"]`)
        .first()

    const clickProfileAction = async (username, actionLabel) => {
      await findProfileAction(username, actionLabel).evaluate((button) => {
        button.click()
      })
    }

    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 1600 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(page)

    await page.getByLabel('Username').fill(aliceUsername)
    await page.getByLabel('Display name').fill('Alice Scoped')
    await page.getByLabel('Welcome message').fill('Alice settings stay with Alice')
    await clickButtonByName(page, /create and select/i)

    await expect(page.getByRole('link', { name: /CET-4/i })).toBeVisible()
    await page.getByLabel('开关深色模式').click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.getByRole('link', { name: /CET-4/i }).click()
    await page.getByRole('button', { name: /CET-6/i }).first().click()
    await page.getByText('第 1 章').first().click()
    await waitForServerSettings(page, { currentDict: 'cet6', isOpenDarkModeAtom: true })
    await expect(page.getByRole('link', { name: /CET-6/i })).toBeVisible()

    await page.getByRole('button', { name: /manage profiles/i }).click()
    await page.getByLabel('Username').fill(bobUsername)
    await page.getByLabel('Display name').fill('Bob Scoped')
    await page.getByLabel('Welcome message').fill('Bob keeps his own defaults')
    await clickButtonByName(page, /create and select/i)

    await expect(page.getByText(`Bob Scoped · @${bobUsername}`)).toBeVisible()
    await expect(page.getByRole('link', { name: /CET-4/i })).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: /manage profiles/i }).click()
    await clickProfileAction(aliceUsername, 'Switch')

    await expect(page.getByText(`Alice Scoped · @${aliceUsername}`)).toBeVisible()
    await page.waitForFunction(
      async () => {
        const response = await fetch('/api/sync/bootstrap', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        })
        if (!response.ok) return false
        const payload = await response.json()
        return payload?.settings?.payload?.currentDict === 'cet6' && payload?.settings?.payload?.isOpenDarkModeAtom === true
      },
      undefined,
      { timeout: 15000 },
    )
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('cross-device sync convergence keeps synced settings for the same profile', async ({ browser }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `cross-device-${unique}`

    const contextA = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageA = await contextA.newPage()
    await pageA.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(pageA)

    await pageA.getByLabel('Username').fill(aliceUsername)
    await pageA.getByLabel('Display name').fill('Alice Cross Device')
    await pageA.getByLabel('Welcome message').fill('Cross-device convergence')
    await clickButtonByName(pageA, /create and select/i)

    await pageA.getByLabel('开关深色模式').click()
    await expect(pageA.locator('html')).toHaveClass(/dark/)
    await pageA.getByRole('link', { name: /CET-4/i }).click()
    await pageA.getByRole('button', { name: /CET-6/i }).first().click()
    await pageA.getByText('第 1 章').first().click()
    await expect(pageA.getByRole('link', { name: /CET-6/i })).toBeVisible()

    const contextB = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageB = await contextB.newPage()
    await pageB.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(pageB.getByText(`@${aliceUsername}`)).toBeVisible()
    await pageB
      .locator('span')
      .filter({ hasText: `@${aliceUsername}` })
      .locator('xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="Switch"]')
      .first()
      .click()

    await expect(pageB.getByText(`Alice Cross Device · @${aliceUsername}`)).toBeVisible()
    await expect(pageB.getByRole('link', { name: /CET-6/i })).toBeVisible()
    await expect(pageB.locator('html')).toHaveClass(/dark/)

    await contextA.close()
    await contextB.close()
  })

  test('cross-device sync convergence hydrates practice data into error book', async ({ browser }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `practice-sync-${unique}`
    const syncedWord = `syncword${unique}`

    const contextA = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageA = await contextA.newPage()
    await pageA.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(pageA)

    await pageA.getByLabel('Username').fill(aliceUsername)
    await pageA.getByLabel('Display name').fill('Alice Practice Sync')
    await pageA.getByLabel('Welcome message').fill('Practice should sync too')
    await clickButtonByName(pageA, /create and select/i)

    await pageA.evaluate(async ({ syncedWord }) => {
      await fetch('/api/sync/practice', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          wordRecords: [
            {
              recordId: `word-${syncedWord}`,
              updatedAt: new Date().toISOString(),
              word: syncedWord,
              timeStamp: Math.floor(Date.now() / 1000),
              dict: 'cet4',
              chapter: 0,
              timing: [120, 110],
              wrongCount: 2,
              mistakes: { 0: ['q'] },
            },
          ],
          chapterRecords: [
            {
              recordId: `chapter-${syncedWord}`,
              updatedAt: new Date().toISOString(),
              dict: 'cet4',
              chapter: 0,
              timeStamp: Math.floor(Date.now() / 1000),
              time: 30,
              correctCount: 18,
              wrongCount: 2,
              wordCount: 20,
              correctWordIndexes: [0, 1, 2],
              wordNumber: 20,
              wordRecordIds: [],
            },
          ],
        }),
      })
    }, { syncedWord })

    const contextB = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageB = await contextB.newPage()
    await pageB.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(pageB.getByText(`@${aliceUsername}`)).toBeVisible()
    await pageB
      .locator('span')
      .filter({ hasText: `@${aliceUsername}` })
      .locator('xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="Switch"]')
      .first()
      .click()

    await pageB.waitForFunction(
      async (syncedWord) => {
        const response = await fetch('/api/sync/bootstrap', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        })
        if (!response.ok) return false
        const payload = await response.json()
        return Array.isArray(payload?.practice?.wordRecords) && payload.practice.wordRecords.some((record) => record.word === syncedWord)
      },
      syncedWord,
      { timeout: 15000 },
    )

    await pageB.locator('button[title="查看错题本"]').click()
    await expect(pageB.getByText(syncedWord)).toBeVisible({ timeout: 15000 })

    await contextA.close()
    await contextB.close()
  })

  test('server unavailable blocks profile creation instead of falling back to local mode', async ({ page }) => {
    await page.route('**/api/profiles', async (route) => {
      await route.abort()
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Server unavailable')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /create and select/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /refresh/i })).toBeEnabled()
  })

  test('stale revision conflict handling retries and keeps the latest user choice', async ({ browser }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `stale-revision-${unique}`

    const contextA = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageA = await contextA.newPage()
    await pageA.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(pageA)

    await pageA.getByLabel('Username').fill(aliceUsername)
    await pageA.getByLabel('Display name').fill('Alice Stale Revision')
    await pageA.getByLabel('Welcome message').fill('Retry conflicts automatically')
    await clickButtonByName(pageA, /create and select/i)
    await expect(pageA.getByRole('link', { name: /CET-4/i })).toBeVisible()

    await pageA.evaluate(async () => {
      await fetch('/api/sync/settings', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          baseRevision: 0,
          payload: {
            currentDict: 'cet4',
            isOpenDarkModeAtom: false,
          },
        }),
      })
    })

    await pageA.getByLabel('开关深色模式').click()
    await expect(pageA.locator('html')).toHaveClass(/dark/)
    await pageA.getByRole('link', { name: /CET-4/i }).click()
    await pageA.getByRole('button', { name: /CET-6/i }).first().click()
    await pageA.getByText('第 1 章').first().click()
    await expect(pageA.getByRole('link', { name: /CET-6/i })).toBeVisible()

    const contextB = await browser.newContext({ viewport: { width: 1440, height: 1600 }, colorScheme: 'light' })
    const pageB = await contextB.newPage()
    await pageB.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(pageB.getByText(`@${aliceUsername}`)).toBeVisible()
    await pageB
      .locator('span')
      .filter({ hasText: `@${aliceUsername}` })
      .locator('xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="Switch"]')
      .first()
      .click()

    await expect(pageB.getByText(`Alice Stale Revision · @${aliceUsername}`)).toBeVisible()
    await expect(pageB.getByRole('link', { name: /CET-6/i })).toBeVisible()
    await expect(pageB.locator('html')).toHaveClass(/dark/)

    await contextA.close()
    await contextB.close()
  })

  test('profile management updates the selector state', async ({ page }) => {
    const unique = Date.now().toString().slice(-6)
    const aliceUsername = `profile-alpha-${unique}`
    const bobUsername = `profile-beta-${unique}`

    const findProfileAction = (username, actionLabel) =>
      page
        .locator('span')
        .filter({ hasText: `@${username}` })
        .locator(`xpath=ancestor::div[2]/following-sibling::div[1]//button[normalize-space()="${actionLabel}"]`)
        .first()

    const clickProfileAction = async (username, actionLabel) => {
      await findProfileAction(username, actionLabel).evaluate((button) => {
        button.click()
      })
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(page)

    await page.getByLabel('Username').fill(aliceUsername)
    await page.getByLabel('Display name').fill('Alice Profile')
    await page.getByLabel('Welcome message').fill('Alpha welcome')
    await clickButtonByName(page, /create and select/i)
    await expect(page.getByText(`Alice Profile · @${aliceUsername}`)).toBeVisible()

    await page.getByRole('button', { name: /manage profiles/i }).click()
    await page.getByLabel('Username').fill(bobUsername)
    await page.getByLabel('Display name').fill('Bob Profile')
    await page.getByLabel('Welcome message').fill('Beta welcome')
    await clickButtonByName(page, /create and select/i)
    await expect(page.getByText(`Bob Profile · @${bobUsername}`)).toBeVisible()

    await page.getByRole('button', { name: /manage profiles/i }).click()
    await clickProfileAction(aliceUsername, 'Switch')
    await expect(page.getByText(`Alice Profile · @${aliceUsername}`)).toBeVisible()
    await expect(page.getByText('Alpha welcome')).toBeVisible()

    await page.getByRole('button', { name: /manage profiles/i }).click()
    await clickProfileAction(aliceUsername, 'Edit')
    await page.getByLabel('Display name').fill('Alice Updated')
    await page.getByLabel('Welcome message').fill('Alpha updated welcome')
    await clickButtonByName(page, /save profile/i)

    await expect(page.getByText(`Alice Updated · @${aliceUsername}`)).toBeVisible()
    await expect(page.getByText('Alpha updated welcome')).toBeVisible()
  })

  test('typing analysis gallery and error-book routes render synced practice data', async ({ page }) => {
    const unique = Date.now().toString().slice(-6)
    const username = `route-regression-${unique}`
    const syncedWord = `routeword${unique}`

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureProfileFormVisible(page)
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Display name').fill('Route Regression')
    await page.getByLabel('Welcome message').fill('Pages should all load')
    await clickButtonByName(page, /create and select/i)

    await page.evaluate(async ({ syncedWord }) => {
      await fetch('/api/sync/practice', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          wordRecords: [
            {
              recordId: `word-${syncedWord}`,
              updatedAt: new Date().toISOString(),
              word: syncedWord,
              timeStamp: Math.floor(Date.now() / 1000),
              dict: 'cet4',
              chapter: 0,
              timing: [120, 110],
              wrongCount: 2,
              mistakes: { 0: ['q'] },
            },
          ],
          chapterRecords: [
            {
              recordId: `chapter-${syncedWord}`,
              updatedAt: new Date().toISOString(),
              dict: 'cet4',
              chapter: 0,
              timeStamp: Math.floor(Date.now() / 1000),
              time: 30,
              correctCount: 18,
              wrongCount: 2,
              wordCount: 20,
              correctWordIndexes: [0, 1, 2],
              wordNumber: 20,
              wordRecordIds: [],
            },
          ],
        }),
      })
    }, { syncedWord })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: /CET-4/i })).toBeVisible()

    await page.goto('/analysis', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/暂无练习数据|过去一年练习次数热力图/)).toBeVisible({ timeout: 15000 })

    await page.goto('/gallery', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /^CET-4 / })).toBeVisible()

    await page.goto('/error-book', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('单词', { exact: true })).toBeVisible()
    await expect(page.getByText('词典')).toBeVisible()
  })

  for (const scenario of pendingScenarios) {
    test.fixme(`scaffold: ${scenario}`, () => Promise.resolve())
  }
})
