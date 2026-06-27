import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Phase 0: env.ts now hard-requires PARCHMENT_PUBLIC_URL at import time, which
    // nearly every integration test pulls in via `@/db`. setup.ts provides test
    // defaults for that + PARCHMENT_SECRET_KEY so the suite can import env.ts.
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000, // Testcontainers cold pull/start
  },
})
