import { defineConfig, devices } from '@playwright/test'

// e2e + axe-core a11y harness (K4). Static routes render without a DB, so the
// web server runs with a dummy DATABASE_URL; only /api/health touches Postgres.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/a11y.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: 'postgres://parchment:parchment@127.0.0.1:5999/none',
      PORT: '3000',
    },
  },
})
