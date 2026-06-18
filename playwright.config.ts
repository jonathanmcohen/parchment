import { defineConfig, devices } from '@playwright/test'

// e2e + axe-core a11y harness (K4). An owner + session are seeded into the e2e DB
// by global-setup; the authed project carries the session cookie via storageState
// so guarded (app) routes are reachable. Public routes are tested without it.
const E2E_DB =
  process.env.E2E_DATABASE_URL ?? 'postgres://parchment:parchment@127.0.0.1:5434/parchment'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/a11y.json' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB, E2E_DATABASE_URL: E2E_DB, PORT: '3000' },
  },
})
