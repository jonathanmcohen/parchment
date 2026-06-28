// §6 — per-session revoke. revokeSession(userId, sessionId) deletes the row scoped
// to userId (a user can only kill their OWN sessions); the DB row IS the authority
// (getUserByToken looks it up on every request) so a revoked session is dead
// immediately. Cross-user revoke is impossible; a non-existent id is a no-op.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// For the route-level test: stub authenticateRequest to act as a chosen user.
let ROUTE_ACTOR: { id: string } | null = null
vi.mock('@/lib/auth/guard', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guard')>()
  return { ...actual, authenticateRequest: async () => ROUTE_ACTOR }
})

let container: StartedPostgreSqlContainer
let url: string
let USER_A: string
let USER_B: string
const migrationsDir = path.resolve('src/db/migrations')

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

// Insert a FULL (mfaPending=false, unexpired) session for a user and return the
// plaintext token + the row id.
async function mkSession(userId: string): Promise<{ token: string; id: string }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const c = await client()
  const { rows } = await c.query<{ id: string }>(
    'insert into sessions (user_id, token_hash, expires_at, mfa_pending) values ($1,$2,$3,false) returning id',
    [userId, sha256(token), expiresAt],
  )
  await c.end()
  return { token, id: rows[0]?.id as string }
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
  const a = await c.query<{ id: string }>(
    "insert into users (email, name) values ('sess-a@example.com', 'A') returning id",
  )
  const b = await c.query<{ id: string }>(
    "insert into users (email, name) values ('sess-b@example.com', 'B') returning id",
  )
  USER_A = a.rows[0]?.id as string
  USER_B = b.rows[0]?.id as string
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('§6 — revokeSession', () => {
  it('revoking one session kills only that one; the revoked token resolves to null', async () => {
    const { revokeSession } = await import('@/lib/auth/sessions-repo')
    const { getUserByToken } = await import('@/lib/auth/session')

    const s1 = await mkSession(USER_A)
    const s2 = await mkSession(USER_A)

    const deleted = await revokeSession(USER_A, s1.id)
    expect(deleted).toBe(true)

    // Revoked → DB row gone → next lookup returns null (immediate death).
    expect(await getUserByToken(s1.token)).toBeNull()
    // The other session still resolves to the user.
    const u2 = await getUserByToken(s2.token)
    expect(u2?.id).toBe(USER_A)
  })

  it('cannot revoke another user’s session (scoped delete)', async () => {
    const { revokeSession } = await import('@/lib/auth/sessions-repo')
    const { getUserByToken } = await import('@/lib/auth/session')

    const bSession = await mkSession(USER_B)
    // User A tries to revoke B's session by id → no-op (scoped to A).
    const deleted = await revokeSession(USER_A, bSession.id)
    expect(deleted).toBe(false)
    // B's session is untouched.
    expect((await getUserByToken(bSession.token))?.id).toBe(USER_B)
  })

  it('revoking a non-existent id is a no-op (returns false, no throw)', async () => {
    const { revokeSession } = await import('@/lib/auth/sessions-repo')
    const deleted = await revokeSession(USER_A, '00000000-0000-0000-0000-000000000000')
    expect(deleted).toBe(false)
  })
})

describe('§6 — DELETE /api/auth/sessions/[id] route', () => {
  function del(id: string, bearer = false): NextRequest {
    const headers: Record<string, string> = { 'x-forwarded-for': '198.51.100.7' }
    if (bearer) headers.authorization = 'Bearer pat_x'
    return new Request(`http://localhost/api/auth/sessions/${id}`, {
      method: 'DELETE',
      headers,
    }) as unknown as NextRequest
  }

  it('a session user revokes their session → 200 + a session.revoke audit row + chain ok', async () => {
    const { DELETE } = await import('@/app/api/auth/sessions/[id]/route')
    ROUTE_ACTOR = { id: USER_A }
    const s = await mkSession(USER_A)
    const res = await DELETE(del(s.id), { params: Promise.resolve({ id: s.id }) })
    expect(res.status).toBe(200)

    const c = await client()
    const { rows } = await c.query<{ action: string; target_id: string | null; ip: string | null }>(
      "select action, target_id, ip from audit_log where action='session.revoke' order by created_at desc limit 1",
    )
    await c.end()
    expect(rows[0]?.action).toBe('session.revoke')
    expect(rows[0]?.target_id).toBe(s.id)
    expect(rows[0]?.ip).toBe('198.51.100.7')

    const { verifyAuditChain } = await import('@/lib/audit')
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('a Bearer (PAT) request is rejected — session-only', async () => {
    const { DELETE } = await import('@/app/api/auth/sessions/[id]/route')
    ROUTE_ACTOR = { id: USER_A }
    const s = await mkSession(USER_A)
    const res = await DELETE(del(s.id, true), { params: Promise.resolve({ id: s.id }) })
    expect(res.status).toBe(401)
  })

  it('revoking a session that is not the caller’s → 404', async () => {
    const { DELETE } = await import('@/app/api/auth/sessions/[id]/route')
    ROUTE_ACTOR = { id: USER_A }
    const bSession = await mkSession(USER_B)
    const res = await DELETE(del(bSession.id), { params: Promise.resolve({ id: bSession.id }) })
    expect(res.status).toBe(404)
  })
})
