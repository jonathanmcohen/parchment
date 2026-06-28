import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// A1/A2/A6 Task 10 + Task 14: user-management Server Actions — the AUTHORIZATION
// boundary. We stub requireAdmin/requireRole/requireUser per-case via vi.mock so we
// can drive each action as a chosen actor; the repo invariants run for real against
// Postgres.

// The current acting user, swapped per-case before invoking an action.
let CURRENT: { id: string; role: string; name: string }
vi.mock('@/lib/auth/guard', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guard')>()
  return {
    ...actual,
    requireRole: async () => CURRENT,
    requireAdmin: async () => CURRENT,
    requireUser: async () => CURRENT,
  }
})
// sendInviteEmail hits the B seam / cookies-free path; stub it to a no-op so the
// invite action never depends on SMTP or a request scope.
vi.mock('@/lib/auth/email', () => ({ sendInviteEmail: async () => {} }))
// revalidatePath needs a Next static-generation store (only present in a real
// request); stub it to a no-op so the action's DB effect + return value is what we
// assert. The cache-revalidation side-effect is exercised by the e2e suite.
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')
let ownerId = ''
let adminId = ''
let editorId = ''

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
  const mk = async (email: string, role: string) => {
    const r = await c.query<{ id: string }>(
      'INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id',
      [email, email.split('@')[0], role],
    )
    return r.rows[0]!.id
  }
  ownerId = await mk('owner@p.local', 'owner')
  adminId = await mk('admin@p.local', 'admin')
  editorId = await mk('editor@p.local', 'editor')
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A1/A2/A6 — user-management actions (authorization boundary)', () => {
  it('an admin cannot create or promote a user to admin/owner (anti-escalation)', async () => {
    const { createUserAction, setUserRoleAction } = await import(
      '@/app/(app)/settings/users/actions'
    )
    CURRENT = { id: adminId, role: 'admin', name: 'admin' }

    const fd = new FormData()
    fd.set('email', `esc-${Date.now()}@p.local`)
    fd.set('name', 'Esc')
    fd.set('role', 'admin')
    expect(await createUserAction(null, fd)).toEqual({
      error: expect.stringMatching(/permission|role/i),
    })

    const fd2 = new FormData()
    fd2.set('userId', editorId)
    fd2.set('role', 'owner')
    expect(await setUserRoleAction(null, fd2)).toEqual({
      error: expect.stringMatching(/permission|role|owner/i),
    })
  })

  it('the owner can promote a user to admin', async () => {
    const { setUserRoleAction } = await import('@/app/(app)/settings/users/actions')
    const usersRepo = await import('@/lib/auth/users-repo')
    CURRENT = { id: ownerId, role: 'owner', name: 'owner' }
    const fd = new FormData()
    fd.set('userId', editorId)
    fd.set('role', 'admin')
    expect(await setUserRoleAction(null, fd)).toBeNull()
    expect((await usersRepo.getUser(editorId))?.role).toBe('admin')
    // restore editor for later tests
    const back = new FormData()
    back.set('userId', editorId)
    back.set('role', 'editor')
    await setUserRoleAction(null, back)
  })

  it('an admin cannot delete their own account (self-lockout guard)', async () => {
    const { deleteUserAction } = await import('@/app/(app)/settings/users/actions')
    CURRENT = { id: adminId, role: 'admin', name: 'admin' }
    const fd = new FormData()
    fd.set('userId', adminId)
    expect(await deleteUserAction(null, fd)).toEqual({
      error: expect.stringMatching(/yourself|own account/i),
    })
  })

  it('inviteUserAction creates a live invite and returns its accept URL', async () => {
    const { inviteUserAction } = await import('@/app/(app)/settings/users/actions')
    CURRENT = { id: ownerId, role: 'owner', name: 'owner' }
    const fd = new FormData()
    fd.set('email', `inv-${Date.now()}@p.local`)
    fd.set('role', 'editor')
    const res = await inviteUserAction(null, fd)
    expect(res).toMatchObject({ acceptUrl: expect.stringContaining('/accept/') })
  })

  it('A6 composed: owner is never lockable-out across the action layer', async () => {
    const { deleteUserAction, setUserRoleAction, setUserDisabledAction, transferOwnershipAction } =
      await import('@/app/(app)/settings/users/actions')
    const usersRepo = await import('@/lib/auth/users-repo')

    // Ensure we start with exactly one owner
    const allUsers = await usersRepo.listUsers()
    const ownerUser = allUsers.find((u) => u.role === 'owner')!
    const adminUser = allUsers.find((u) => u.role === 'admin')!
    expect(await usersRepo.countOwners()).toBe(1)

    // CURRENT=admin: every owner-targeting destructive action must be rejected
    CURRENT = { id: adminUser.id, role: 'admin', name: 'admin' }

    const delFd = new FormData()
    delFd.set('userId', ownerUser.id)
    const delResult = await deleteUserAction(null, delFd)
    expect(delResult).toMatchObject({ error: expect.any(String) })
    expect((await usersRepo.getUser(ownerUser.id))?.role).toBe('owner')

    const roleFd = new FormData()
    roleFd.set('userId', ownerUser.id)
    roleFd.set('role', 'admin')
    const roleResult = await setUserRoleAction(null, roleFd)
    expect(roleResult).toMatchObject({ error: expect.any(String) })
    expect((await usersRepo.getUser(ownerUser.id))?.role).toBe('owner')

    const disFd = new FormData()
    disFd.set('userId', ownerUser.id)
    disFd.set('disabled', 'true')
    const disResult = await setUserDisabledAction(null, disFd)
    expect(disResult).toMatchObject({ error: expect.any(String) })
    expect((await usersRepo.getUser(ownerUser.id))?.disabledAt).toBeNull()

    // CURRENT=owner: transfer to admin succeeds; count remains 1
    CURRENT = { id: ownerUser.id, role: 'owner', name: 'owner' }
    const xferFd = new FormData()
    xferFd.set('toUserId', adminUser.id)
    const xferResult = await transferOwnershipAction(null, xferFd)
    expect(xferResult).toBeNull()
    expect((await usersRepo.getUser(adminUser.id))?.role).toBe('owner')
    expect((await usersRepo.getUser(ownerUser.id))?.role).toBe('admin')
    expect(await usersRepo.countOwners()).toBe(1)

    // Restore original ownership so later tests are unaffected
    CURRENT = { id: adminUser.id, role: 'owner', name: 'admin' }
    const restoreFd = new FormData()
    restoreFd.set('toUserId', ownerUser.id)
    await transferOwnershipAction(null, restoreFd)
    expect(await usersRepo.countOwners()).toBe(1)
  })
})
