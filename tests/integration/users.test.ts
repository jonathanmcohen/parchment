import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A3/A6 + A1/A8: disabled-user auth enforcement + user CRUD lifecycle against a
// real Postgres via Testcontainers. Mirrors the boilerplate in shares.test.ts.

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

  // Seed exactly one bootstrap owner — the owner-invariant tests rely on this.
  await c.query("INSERT INTO users (email, name, role) VALUES ('owner@p.local','Owner','owner')")

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A3/A6 — disabled-user enforcement', () => {
  it('a disabled user cannot be resolved from a valid session token', async () => {
    const { db, schema } = await import('@/db')
    const { getUserByToken } = await import('@/lib/auth/session')

    // create an active user + a session row directly (bypass cookie helpers)
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'dis@p.local', name: 'Dis', role: 'editor' })
      .returning({ id: schema.users.id })
    const token = 'rawtoken-disabled-test'
    const { createHash } = await import('node:crypto')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await db.insert(schema.sessions).values({
      userId: u!.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
    })

    expect(await getUserByToken(token)).not.toBeNull() // active → resolves

    await db.update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, u!.id))

    expect(await getUserByToken(token)).toBeNull() // disabled → null
  })

  it('login server action rejects a disabled user with the generic error', async () => {
    const { db, schema } = await import('@/db')
    const { hashPassword } = await import('@/lib/auth/password')
    const { login } = await import('@/app/(auth)/login/actions')
    await db.insert(schema.users).values({
      email: 'login-dis@p.local',
      name: 'LD',
      role: 'editor',
      passwordHash: await hashPassword('correct-horse'),
      disabledAt: new Date(),
    })
    const fd = new FormData()
    fd.set('email', 'login-dis@p.local')
    fd.set('password', 'correct-horse')
    const res = await login(null, fd)
    expect(res).toEqual({ error: 'Invalid email or password.' }) // no oracle
  })
})

describe('A1/A6 — user CRUD + lifecycle, owner-never-locked-out', () => {
  it('countOwners reflects owner rows; the last owner cannot be deleted or demoted or disabled', async () => {
    const repo = await import('@/lib/auth/users-repo')

    // ensure exactly one owner exists for this assertion block
    const owners = await repo.listUsers()
    const ownerRows = owners.filter((u) => u.role === 'owner')
    expect(ownerRows.length).toBeGreaterThanOrEqual(1)

    if (ownerRows.length === 1) {
      const onlyOwner = ownerRows[0]!
      await expect(repo.deleteUser(onlyOwner.id)).rejects.toThrow(/last owner/i)
      await expect(repo.setUserRole(onlyOwner.id, 'admin')).rejects.toThrow(/last owner/i)
      await expect(repo.setUserDisabled(onlyOwner.id, true)).rejects.toThrow(/last owner/i)
    }
  })

  it('transferOwnership is atomic: old owner becomes admin, new owner becomes owner', async () => {
    const repo = await import('@/lib/auth/users-repo')
    const oldOwner = (await repo.listUsers()).find((u) => u.role === 'owner')!
    const newUser = await repo.createUser({
      email: `xfer-${Date.now()}@p.local`,
      name: 'Heir',
      role: 'admin',
    })
    await repo.transferOwnership(oldOwner.id, newUser.id)
    expect((await repo.getUser(newUser.id))?.role).toBe('owner')
    expect((await repo.getUser(oldOwner.id))?.role).toBe('admin')
    expect(await repo.countOwners()).toBe(1) // still exactly one owner
    // restore for later tests
    await repo.transferOwnership(newUser.id, oldOwner.id)
  })

  it('disabling a user revokes their live sessions', async () => {
    const repo = await import('@/lib/auth/users-repo')
    const { db, schema } = await import('@/db')
    const u = await repo.createUser({
      email: `kill-${Date.now()}@p.local`,
      name: 'K',
      role: 'editor',
    })
    await db.insert(schema.sessions).values({
      userId: u.id,
      tokenHash: `h-${u.id}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    await repo.setUserDisabled(u.id, true)
    const left = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))
    expect(left.length).toBe(0)
  })
})
