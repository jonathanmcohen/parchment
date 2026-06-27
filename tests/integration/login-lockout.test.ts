// §4 — login per-account brute-force lockout. Tests the lockout repo invariants
// directly AND drives the login Server Action: after LOCKOUT_THRESHOLD wrong
// passwords for one email, the (N+1)th attempt is rejected EVEN WITH the correct
// password until the cooldown; a correct password before the cap resets the
// counter; lockouts are per-account (one email's lock never affects another).
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { hash as argonHash } from '@node-rs/argon2'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The login action mints sessions (cookie scope) and redirects on success. Stub
// session + redirect + clientIp so we can drive it headlessly and assert returns.
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/session')>()
  return { ...actual, createSession: async () => {}, createPendingSession: async () => {} }
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const e = new Error(`NEXT_REDIRECT:${url}`)
    ;(e as { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw e
  },
}))
// clientIp() reads next/headers (no request scope in a unit driver) — stub a fixed IP.
vi.mock('@/lib/auth/rate-limit', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/rate-limit')>()
  return { ...actual, clientIp: async () => '203.0.113.99' }
})

let container: StartedPostgreSqlContainer
let url: string
const migrationsDir = path.resolve('src/db/migrations')
const argonOptions = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  url = container.getConnectionUri()
  const c = await client()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const pw = await argonHash('correct-password', argonOptions)
  await c.query("insert into users (email, name, password_hash, role) values ($1,'V',$2,'editor')", [
    'victim@example.com',
    pw,
  ])
  await c.query("insert into users (email, name, password_hash, role) values ($1,'O',$2,'editor')", [
    'other@example.com',
    pw,
  ])
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

beforeEach(async () => {
  const c = await client()
  await c.query('delete from login_lockouts')
  await c.end()
  // The per-IP rate limiter is an in-process Map on globalThis; clear it between
  // tests so accumulated hits from prior cases don't trip the throttle and mask
  // the per-account lockout behavior under test.
  const g = globalThis as unknown as { __authRateLimit?: Map<string, unknown> }
  g.__authRateLimit?.clear()
})

describe('§4 — lockout repo invariants', () => {
  it('locks after LOCKOUT_THRESHOLD consecutive failures and resets on success', async () => {
    const { recordLoginFailure, resetLoginLockout, getLockoutStatus, LOCKOUT_THRESHOLD } =
      await import('@/lib/auth/lockout-repo')

    let status = { locked: false } as { locked: boolean }
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      status = await recordLoginFailure('victim@example.com')
    }
    expect(status.locked).toBe(true)
    expect((await getLockoutStatus('victim@example.com')).locked).toBe(true)

    await resetLoginLockout('victim@example.com')
    expect((await getLockoutStatus('victim@example.com')).locked).toBe(false)
  })

  it('does not lock below the threshold', async () => {
    const { recordLoginFailure, getLockoutStatus, LOCKOUT_THRESHOLD } = await import(
      '@/lib/auth/lockout-repo'
    )
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      await recordLoginFailure('victim@example.com')
    }
    expect((await getLockoutStatus('victim@example.com')).locked).toBe(false)
  })

  it('stores a sha256 email_hash, never the raw email', async () => {
    const { recordLoginFailure } = await import('@/lib/auth/lockout-repo')
    await recordLoginFailure('victim@example.com')
    const c = await client()
    const { rows } = await c.query<{ email_hash: string }>('select email_hash from login_lockouts')
    await c.end()
    expect(rows[0]?.email_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]?.email_hash).not.toContain('victim@example.com')
  })
})

describe('§4 — login action enforces the lockout', () => {
  it('rejects the correct password once locked, and lockouts are per-account', async () => {
    const { login } = await import('@/app/(auth)/login/actions')
    const { LOCKOUT_THRESHOLD } = await import('@/lib/auth/lockout-repo')

    const bad = () => {
      const fd = new FormData()
      fd.set('email', 'victim@example.com')
      fd.set('password', 'wrong-password')
      return fd
    }
    const good = () => {
      const fd = new FormData()
      fd.set('email', 'victim@example.com')
      fd.set('password', 'correct-password')
      return fd
    }

    // N wrong attempts → trips the lockout.
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      const r = await login(null, bad())
      expect(r && 'error' in r).toBe(true)
    }

    // Now the CORRECT password is rejected (generic error, NO redirect/session).
    const locked = await login(null, good())
    expect(locked && 'error' in locked).toBe(true)

    // A different account is unaffected by victim's lockout — correct password
    // logs in (the action redirects → throws NEXT_REDIRECT).
    const otherGood = new FormData()
    otherGood.set('email', 'other@example.com')
    otherGood.set('password', 'correct-password')
    await expect(login(null, otherGood)).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('a correct password BEFORE the cap resets the counter (no lockout)', async () => {
    const { login } = await import('@/app/(auth)/login/actions')
    const { getLockoutStatus } = await import('@/lib/auth/lockout-repo')

    // A few failures, then a success → counter cleared.
    for (let i = 0; i < 3; i++) {
      const fd = new FormData()
      fd.set('email', 'victim@example.com')
      fd.set('password', 'wrong-password')
      await login(null, fd)
    }
    const good = new FormData()
    good.set('email', 'victim@example.com')
    good.set('password', 'correct-password')
    await expect(login(null, good)).rejects.toThrow(/NEXT_REDIRECT/)
    expect((await getLockoutStatus('victim@example.com')).locked).toBe(false)
  })

  it('emits a login.locked audit row when the lockout trips, with no email in meta', async () => {
    const { login } = await import('@/app/(auth)/login/actions')
    const { LOCKOUT_THRESHOLD } = await import('@/lib/auth/lockout-repo')
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      const fd = new FormData()
      fd.set('email', 'victim@example.com')
      fd.set('password', 'wrong-password')
      await login(null, fd)
    }
    const c = await client()
    const { rows } = await c.query<{ action: string; meta: Record<string, unknown> | null }>(
      "select action, meta from audit_log where action='login.locked' order by created_at desc limit 1",
    )
    await c.end()
    expect(rows[0]?.action).toBe('login.locked')
    // No raw email in the audit meta (privacy).
    expect(JSON.stringify(rows[0]?.meta ?? {})).not.toContain('victim@example.com')

    const { verifyAuditChain } = await import('@/lib/audit')
    expect((await verifyAuditChain()).ok).toBe(true)
  })
})
