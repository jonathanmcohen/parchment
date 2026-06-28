// Vitest global setup (run once per worker before any test file).
//
// Phase 0 made PARCHMENT_PUBLIC_URL a REQUIRED env: src/lib/env.ts throws at
// module-evaluation time if it is absent, and PARCHMENT_SECRET_KEY must be valid
// base64-32B if present. Almost every integration test transitively imports
// `@/lib/env` (via `@/db`), so without a value here the whole suite would crash at
// import. We provide deterministic test defaults for both.
//
// The dedicated env-validation tests (tests/integration/secret-box-env.test.ts)
// deliberately override these via vi.stubEnv(...) + vi.resetModules() to assert the
// accept/throw behavior in isolation — vi.stubEnv takes precedence over what is set
// here, and stubbing an empty string is treated as "absent" by env.ts. So these
// defaults never mask the validation tests.
import { Buffer } from 'node:buffer'

if (!process.env.PARCHMENT_PUBLIC_URL) {
  process.env.PARCHMENT_PUBLIC_URL = 'http://localhost:3000'
}

// Fixed 32-byte base64 key so encrypted-config / app_config integration tests have a
// usable master key. Deterministic (not random) so re-evaluating env.ts across
// vi.resetModules() inside one worker stays consistent.
if (!process.env.PARCHMENT_SECRET_KEY) {
  process.env.PARCHMENT_SECRET_KEY = Buffer.alloc(32, 7).toString('base64')
}
