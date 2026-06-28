import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A5 Task 9: invites repo (single-use hashed token, accept→create-user+password,
// expiry, replay protection) + the accept Server Action, against real Postgres.

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')
let ownerId = ''

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
  const r = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('owner@p.local','Owner','owner') RETURNING id",
  )
  ownerId = r.rows[0]!.id
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A5 — invites repo', () => {
  it('createInvite returns a single-use token; only its sha256 is stored', async () => {
    const repo = await import('@/lib/auth/invites-repo')
    const { db, schema } = await import('@/db')
    const { token, id } = await repo.createInvite({
      email: 'invitee@p.local',
      role: 'editor',
      invitedBy: ownerId,
      ttlHours: 72,
    })
    expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/)
    const [row] = await db.select().from(schema.invites).where(eq(schema.invites.id, id))
    expect(row?.tokenHash).not.toEqual(token) // hash stored, not plaintext
    const { createHash } = await import('node:crypto')
    expect(row?.tokenHash).toEqual(createHash('sha256').update(token).digest('hex'))
  })

  it('acceptInvite creates the user with the invited role + password, consumes the invite', async () => {
    const repo = await import('@/lib/auth/invites-repo')
    const usersRepo = await import('@/lib/auth/users-repo')
    const { verifyPassword } = await import('@/lib/auth/password')
    const { token } = await repo.createInvite({
      email: 'newbie@p.local',
      role: 'viewer',
      invitedBy: ownerId,
      ttlHours: 72,
    })
    const result = await repo.acceptInvite(token, { name: 'Newbie', password: 'sup3r-secret' })
    expect(result.ok).toBe(true)
    const u = await usersRepo.getUserByEmail('newbie@p.local')
    expect(u?.role).toBe('viewer')
    expect(u?.disabledAt).toBeNull()
    expect(await verifyPassword(u!.passwordHash!, 'sup3r-secret')).toBe(true)
    // invite consumed → cannot be reused
    const replay = await repo.acceptInvite(token, { name: 'X', password: 'whatever-1234' })
    expect(replay.ok).toBe(false)
  })

  it('an expired invite cannot be accepted', async () => {
    const repo = await import('@/lib/auth/invites-repo')
    const { token } = await repo.createInvite({
      email: 'stale@p.local',
      role: 'viewer',
      invitedBy: ownerId,
      ttlHours: -1, // already expired
    })
    const res = await repo.acceptInvite(token, { name: 'S', password: 'sup3r-secret' })
    expect(res.ok).toBe(false)
  })

  it('acceptInviteAction rejects an invalid token and accepts a valid one', async () => {
    const { acceptInviteAction } = await import('@/app/(auth)/accept/[token]/actions')
    const repo = await import('@/lib/auth/invites-repo')
    const bad = new FormData()
    bad.set('token', 'nope')
    bad.set('name', 'X')
    bad.set('password', 'sup3r-secret')
    expect(await acceptInviteAction(null, bad)).toEqual({
      error: 'This invitation is no longer valid.',
    })
    // Valid path: the action consumes the invite + creates the user, then proceeds
    // to createSession/redirect. In the node test there is no request scope, so
    // createSession's cookies() throws — i.e. the action does NOT return an {error}
    // object on the valid path (it reached the success branch). We assert it threw
    // (not returned) AND that the user was actually created from the invite.
    const usersRepo = await import('@/lib/auth/users-repo')
    const { token } = await repo.createInvite({
      email: 'flow@p.local',
      role: 'viewer',
      invitedBy: ownerId,
      ttlHours: 72,
    })
    const ok = new FormData()
    ok.set('token', token)
    ok.set('name', 'Flow')
    ok.set('password', 'sup3r-secret')
    await expect(acceptInviteAction(null, ok)).rejects.toBeDefined()
    const created = await usersRepo.getUserByEmail('flow@p.local')
    expect(created?.role).toBe('viewer')
    expect(created?.disabledAt).toBeNull()
  })
})
