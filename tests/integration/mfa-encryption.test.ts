// §2 (encrypt-at-rest gap-fill) — the TOTP secret and recovery codes that
// src/lib/auth/mfa-repo.ts persists must be ENCRYPTED at rest via the Phase-0
// secret-box, so a DB-only dump reveals neither the live base32 TOTP secret nor the
// argon2 recovery-code hashes. Reads transparently decrypt, so every consumer
// (verify/enable/disable routes) keeps working unchanged.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers). PARCHMENT_SECRET_KEY comes from
// tests/setup.ts (a fixed 32-byte test key).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let container: StartedPostgreSqlContainer
let url: string
let USER_ID: string
const migrationsDir = path.resolve('src/db/migrations')

async function rawClient(): Promise<Client> {
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
  const c = await rawClient()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const u = await c.query<{ id: string }>(
    "insert into users (email, name) values ('mfa-enc@example.com', 'M') returning id",
  )
  USER_ID = u.rows[0]?.id as string
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

beforeEach(async () => {
  const c = await rawClient()
  await c.query('delete from user_mfa where user_id=$1', [USER_ID])
  await c.end()
})

const SECRET = 'JBSWY3DPEHPK3PXP' // a sample base32 TOTP secret

describe('§2 — TOTP secret encrypted at rest', () => {
  it('setTotp stores an encrypted envelope, not the plaintext base32 secret', async () => {
    const { setTotp } = await import('@/lib/auth/mfa-repo')
    await setTotp(USER_ID, SECRET, [])

    const c = await rawClient()
    const { rows } = await c.query<{ totp_secret: string }>(
      'select totp_secret from user_mfa where user_id=$1',
      [USER_ID],
    )
    await c.end()
    const stored = rows[0]?.totp_secret ?? ''
    // The raw column must be a v1: secret-box envelope, never the plaintext.
    expect(stored).not.toBe(SECRET)
    expect(stored).not.toContain(SECRET)
    expect(stored.startsWith('v1:')).toBe(true)
  })

  it('getMfa transparently decrypts totpSecret back to the plaintext', async () => {
    const { setTotp, getMfa } = await import('@/lib/auth/mfa-repo')
    await setTotp(USER_ID, SECRET, [])
    const row = await getMfa(USER_ID)
    expect(row?.totpSecret).toBe(SECRET)
  })

  it('recovery code hashes are stored encrypted (not the argon2 hash in cleartext)', async () => {
    const { setTotp, hashRecoveryCodes } = await import('@/lib/auth/mfa-repo')
    const hashes = await hashRecoveryCodes(['abcd-efgh-ijkl-mnop'])
    await setTotp(USER_ID, SECRET, hashes)

    const c = await rawClient()
    const { rows } = await c.query<{ recovery_codes: unknown }>(
      'select recovery_codes from user_mfa where user_id=$1',
      [USER_ID],
    )
    await c.end()
    const stored = rows[0]?.recovery_codes as string[]
    expect(Array.isArray(stored)).toBe(true)
    expect(stored.length).toBe(1)
    // Stored form is an envelope, NOT the raw argon2 hash.
    expect(stored[0]?.startsWith('v1:')).toBe(true)
    expect(stored[0]).not.toContain('$argon2')
  })

  it('consumeRecoveryCode still matches + single-uses a code through the encrypted store', async () => {
    const { setTotp, enableTotp, hashRecoveryCodes, consumeRecoveryCode, getMfa } = await import(
      '@/lib/auth/mfa-repo'
    )
    const code = 'abcd-efgh-ijkl-mnop'
    const hashes = await hashRecoveryCodes([code, 'zzzz-zzzz-zzzz-zzzz'])
    await setTotp(USER_ID, SECRET, hashes)
    await enableTotp(USER_ID)

    expect(await consumeRecoveryCode(USER_ID, code)).toBe(true)
    // Single-use: the same code no longer matches.
    expect(await consumeRecoveryCode(USER_ID, code)).toBe(false)
    // The OTHER code is still present (one remaining), still encrypted at rest.
    const row = await getMfa(USER_ID)
    expect(Array.isArray(row?.recoveryCodes) ? row.recoveryCodes.length : 0).toBe(1)

    const c = await rawClient()
    const { rows } = await c.query<{ recovery_codes: string[] }>(
      'select recovery_codes from user_mfa where user_id=$1',
      [USER_ID],
    )
    await c.end()
    expect(rows[0]?.recovery_codes[0]?.startsWith('v1:')).toBe(true)
  })

  it('a corrupt/foreign totpSecret envelope decrypts to null (fail-closed, no crash)', async () => {
    const { getMfa } = await import('@/lib/auth/mfa-repo')
    const c = await rawClient()
    await c.query(
      "insert into user_mfa (user_id, totp_secret, recovery_codes) values ($1, 'not-an-envelope', '[]'::jsonb)",
      [USER_ID],
    )
    await c.end()
    const row = await getMfa(USER_ID)
    // Fail-closed: an undecryptable secret is treated as absent, not surfaced raw.
    expect(row?.totpSecret).toBeNull()
  })
})
