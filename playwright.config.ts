import { defineConfig, devices } from '@playwright/test'

const isLocal = process.env.PLAYWRIGHT_LOCAL === '1'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? (isLocal ? 'http://127.0.0.1:4173' : 'https://qwerty.kaiyi.cool')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: !isLocal,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  timeout: 30 * 1000,
  projects: isLocal
    ? [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
      ],
  webServer: isLocal && !process.env.PLAYWRIGHT_BASE_URL
    ? {
        command: 'npm run start:local-e2e',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      }
    : undefined,
})
