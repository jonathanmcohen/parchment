import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '@/lib/env'
import * as schema from './schema'

// Single shared pool per process. Next dev re-imports modules across HMR, so
// cache the pool on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __pool?: Pool }

const pool = globalForDb.__pool ?? new Pool({ connectionString: env.databaseUrl, max: 10 })

if (env.nodeEnv !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
export { schema }
