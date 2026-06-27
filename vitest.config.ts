import { createRequire } from 'node:module'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// Resolve `import 'server-only'` to the package's no-op `empty.js` so server
// modules guarded by it (session.ts, sessions-repo.ts, doc-access.ts, …) are
// directly importable in node tests — exactly as they resolve inside a Next.js
// RSC bundle (which uses the `react-server` export condition). Without this the
// default condition hits index.js, which throws "cannot be imported from a Client
// Component". A surgical single-specifier alias (NOT a global condition change, so
// nothing else's resolution shifts); test-only, does not weaken the runtime guard.
// `server-only` ships index.js (throws) + empty.js (no-op) at its package root;
// its exports map only exposes '.', so resolve the main entry then swap the file.
const serverOnlyEmpty = createRequire(import.meta.url)
  .resolve('server-only')
  .replace(/index\.js$/, 'empty.js')

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { 'server-only': serverOnlyEmpty },
  },
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
