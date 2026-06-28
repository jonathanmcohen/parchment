// §5.3 — MFA enable/disable routes EMIT the canonical dotted audit verbs
// ('mfa.enable' / 'mfa.disable') via logAuditRequest, and the hash chain stays valid
// after each. Drives the real route handlers with a computed TOTP code against real
// Postgres; auth is stubbed so we act as a chosen user.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import * as OTPAuth from 'otpauth'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let ACTOR: { id: string; email: string; role: string; disabledAt: null } | null = null
// Stub the route auth: enable/disable call authenticateRequest(req); return our actor.
vi.mock('@/lib/auth/guard', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guard')>()
  return { ...actual, authenticateRequest: async () => ACTOR }
})

let container: StartedPostgreSqlContainer
let url: string
const migrationsDir = path.resolve('src/db/migrations')

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

function codeFor(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  })
  return totp.generate()
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
  const u = await c.query<{ id: string }>(
    "insert into users (email, name, role) values ('mfa-wire@example.com', 'W', 'editor') returning id",
  )
  await c.end()
  ACTOR = {
    id: u.rows[0]?.id as string,
    email: 'mfa-wire@example.com',
    role: 'editor',
    disabledAt: null,
  }
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

function reqJson(body: unknown): Request {
  return new Request('http://localhost/api/auth/mfa/totp/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.42' },
    body: JSON.stringify(body),
  })
}

describe('§5.3 — MFA enable/disable emit audit verbs + keep the chain valid', () => {
  it('enable → mfa.enable row (ip from XFF); disable → mfa.disable row; chain ok', async () => {
    // init (provisional secret), enable (mfa.enable), then disable (mfa.disable).
    const { setTotp, hashRecoveryCodes, getMfa } = await import('@/lib/auth/mfa-repo')
    const { generateTotpSecret } = await import('@/lib/auth/mfa')
    const secret = generateTotpSecret()
    await setTotp(ACTOR?.id as string, secret, await hashRecoveryCodes(['code-1-aaaa-bbbb']))

    const { POST: enablePost } = await import('@/app/api/auth/mfa/totp/enable/route')
    const enableRes = await enablePost(reqJson({ token: codeFor(secret) }) as never)
    expect(enableRes.status).toBe(200)

    const { POST: disablePost } = await import('@/app/api/auth/mfa/totp/disable/route')
    // getMfa returns the decrypted secret; compute a fresh code to re-auth the disable.
    const row = await getMfa(ACTOR?.id as string)
    const disableRes = await disablePost(
      reqJson({ token: codeFor(row?.totpSecret as string) }) as never,
    )
    expect(disableRes.status).toBe(200)

    const c = await client()
    const { rows } = await c.query<{ action: string; ip: string | null }>(
      "select action, ip from audit_log where action in ('mfa.enable','mfa.disable') order by created_at asc",
    )
    await c.end()
    const actions = rows.map((r) => r.action)
    expect(actions).toContain('mfa.enable')
    expect(actions).toContain('mfa.disable')
    // ip threaded from the X-Forwarded-For header.
    expect(rows.find((r) => r.action === 'mfa.enable')?.ip).toBe('198.51.100.42')

    const { verifyAuditChain } = await import('@/lib/audit')
    expect((await verifyAuditChain()).ok).toBe(true)
  })
})
