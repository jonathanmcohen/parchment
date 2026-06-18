import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '@/lib/env'
import * as schema from './schema'

// Single shared pool per process. Next dev re-imports modules across HMR, so
// cache the pool on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __pool?: Pool }

const pool = globalForDb.__pool ?? new Pool({ connectionString: env.databaseUrl, max: 10 })

// A dropped idle connection (DB restart, container shutdown in tests) must not
// crash the process — node-postgres throws on an unhandled pool 'error'.
pool.on('error', (e) => {
  if (env.nodeEnv !== 'production') console.error('[db] idle client error:', e.message)
})

if (env.nodeEnv !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
export { schema }

// Closes the shared pool (test teardown; not used in the running app).
export async function closeDb(): Promise<void> {
  if (globalForDb.__pool) {
    await globalForDb.__pool.end()
    delete globalForDb.__pool
  }
}
