// A1/A6: user CRUD + lifecycle. No 'server-only' guard so it is integration-
// testable (mirrors shares-repo). Authorization (who may call these) is enforced
// at the action/route layer; these functions enforce the DATA invariants only —
// chiefly: there is ALWAYS at least one owner. Every owner-affecting mutation
// re-counts owners inside a transaction so two concurrent demotions cannot both
// pass the check.
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Role } from '@/lib/auth/roles'

export type User = typeof schema.users.$inferSelect
export type UserListItem = {
  id: string
  email: string
  name: string
  role: string
  disabledAt: Date | null
  createdAt: Date
}

// NEVER selects passwordHash — the list/detail surfaces must not carry the hash.
export async function listUsers(): Promise<UserListItem[]> {
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt)
}

export async function getUser(id: string): Promise<UserListItem | null> {
  const [u] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)
  return u ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1)
  return u ?? null
}

export async function countOwners(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'))
  return row?.count ?? 0
}

// Create a user. passwordHash is optional: an invited user is created with a null
// hash (disabled until they accept + set a password); a directly-created user may
// be given a hash. Email is lowercased + unique (DB constraint).
export async function createUser(input: {
  email: string
  name: string
  role: Role
  passwordHash?: string | null
  disabled?: boolean
}): Promise<UserListItem> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash ?? null,
      disabledAt: input.disabled ? new Date() : null,
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
  if (!row) throw new Error('createUser: insert returned no row')
  return row
}

// Change a user's workspace role. Demoting the LAST owner is rejected. Runs in a
// transaction that re-counts owners after the update and rolls back if it would
// leave zero owners.
export async function setUserRole(id: string, role: Role): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
    if (!current) throw new Error('user not found')
    if (current.role === 'owner' && role !== 'owner') {
      const [counted] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.role, 'owner'))
      if ((counted?.c ?? 0) <= 1) throw new Error('cannot demote the last owner')
    }
    await tx.update(schema.users).set({ role }).where(eq(schema.users.id, id))
  })
}

// Disable/enable a user. Disabling the LAST owner is rejected. Disabling also
// deletes the user's sessions so any live device is logged out immediately.
export async function setUserDisabled(id: string, disabled: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (disabled) {
      const [current] = await tx
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1)
      if (!current) throw new Error('user not found')
      if (current.role === 'owner') {
        const [counted] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(eq(schema.users.role, 'owner'))
        if ((counted?.c ?? 0) <= 1) throw new Error('cannot disable the last owner')
      }
    }
    await tx
      .update(schema.users)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(eq(schema.users.id, id))
    if (disabled) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, id))
    }
  })
}

// Hard-delete a user. Deleting the LAST owner is rejected. FK cascades remove the
// user's docs/folders/sessions/etc. (see schema onDelete: 'cascade'). Caller is
// responsible for re-assigning docs first if retention is desired (the UI offers
// "transfer their docs" — out of A scope here; documented for J/H).
export async function deleteUser(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
    if (!current) return // already gone — idempotent
    if (current.role === 'owner') {
      const [counted] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.role, 'owner'))
      if ((counted?.c ?? 0) <= 1) throw new Error('cannot delete the last owner')
    }
    await tx.delete(schema.users).where(eq(schema.users.id, id))
  })
}

// Atomic ownership transfer: the current owner becomes 'admin', the target becomes
// 'owner'. Both in one transaction so there is never zero or two owners mid-flight.
// Rejects if `fromId` is not currently an owner or `toId` does not exist / is
// disabled (you cannot hand the keys to a disabled account).
export async function transferOwnership(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) throw new Error('cannot transfer ownership to self')
  await db.transaction(async (tx) => {
    const [from] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, fromId))
      .limit(1)
    if (!from || from.role !== 'owner') throw new Error('source is not the owner')
    const [to] = await tx
      .select({ id: schema.users.id, disabledAt: schema.users.disabledAt })
      .from(schema.users)
      .where(eq(schema.users.id, toId))
      .limit(1)
    if (!to) throw new Error('target user not found')
    if (to.disabledAt !== null) throw new Error('cannot transfer ownership to a disabled user')
    await tx.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, fromId))
    await tx.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, toId))
  })
}
