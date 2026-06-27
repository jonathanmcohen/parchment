// §7b (Phase-0 handoff) — src/app/setup/actions.ts must emit its 'setup' audit
// event via the hash-chained logAudit (NOT a raw db.insert with a NULL entry_hash),
// so the first-boot owner-creation row JOINS the chain and verifyAuditChain() stays
// { ok: true }. This test drives createOwner against real Postgres and asserts both.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// createOwner calls createSession (needs a request/cookie scope) and seedGuideWorkspace
// (a nicety) and finally redirect() (throws Next's control-flow signal). Stub the first
// two to no-ops and swallow the redirect so we can assert the DB + audit effect.
vi.mock('@/lib/auth/session', () => ({ createSession: async () => {} }))
vi.mock('@/lib/docs/seed-guide', () => ({ seedGuideWorkspace: async () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const e = new Error(`NEXT_REDIRECT:${url}`)
    ;(e as { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw e
  },
}))

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('§7b — setup emits a chained audit row', () => {
  it('createOwner writes a setup audit row with a non-null entry_hash and a valid chain', async () => {
    const { createOwner } = await import('@/app/setup/actions')
    const fd = new FormData()
    fd.set('name', 'First Owner')
    fd.set('email', 'owner-7b@example.com')
    fd.set('password', 'a-strong-password')

    // The action redirects on success → swallow the thrown NEXT_REDIRECT signal.
    await expect(createOwner(null, fd)).rejects.toThrow(/NEXT_REDIRECT/)

    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'setup'))
    expect(rows.length).toBe(1)
    // The raw-insert bug left entry_hash NULL; logAudit back-fills it.
    expect(rows[0]?.entryHash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]?.targetType).toBe('user')

    // The setup row participates in the hash chain (the whole point of §7b).
    const { verifyAuditChain } = await import('@/lib/audit')
    const result = await verifyAuditChain()
    expect(result.ok).toBe(true)
  })
})
