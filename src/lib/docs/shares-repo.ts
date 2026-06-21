import { randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// G1 doc sharing. No 'server-only' guard so the repo stays integration-testable
// (the integration suite imports it directly); it touches `db` (pg) and is only
// imported by server routes/components in app code. Client components must never
// import this module (it would pull in @/db).
//
// argon2 is used DIRECTLY here (not via @/lib/auth/password) so this repo carries
// no transitive `server-only` import and stays importable in the Testcontainers
// integration suite. The parameters mirror src/lib/auth/password.ts 1:1 — keep
// them in sync if that baseline is bumped.
//
// SECURITY MODEL (this is access control — read before changing):
//   • token = 32 random bytes, base64url — the capability carried in the share
//     URL. Unguessable; the row's existence is the "anyone with the link" toggle.
//   • Expiry + password are enforced SERVER-SIDE: resolveShare drops expired
//     shares (returns null) and verifySharePassword gates the password. A doc
//     must NEVER render without a valid, non-expired token (+ correct password
//     when one is set).
//   • Every write/list op is owner-scoped via and(eq(id), eq(ownerId)).
//   • The public data path returns ONLY doc content — never passwordHash, owner
//     id, or any other-doc data (the API maps to a safe shape).

export type Share = typeof schema.shares.$inferSelect
export type Permission = 'view' | 'comment' | 'edit' | 'suggest'

export const PERMISSIONS: readonly Permission[] = ['view', 'comment', 'edit', 'suggest']

// argon2id parameters — mirror of src/lib/auth/password.ts (OWASP baseline).
const ARGON_OPTIONS = {
  algorithm: 2, // argon2id
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

/** v0.1 renders read-only on the public route. Only 'view' is a read perm; the
 *  others store the owner's intent but are GAP'd to read-only (anonymous writes
 *  require authenticated collab — deferred to v0.2). The public viewer shows a
 *  "view-only in v0.1" note when the stored perm is a write perm. */
export function isWritePermission(permission: string): boolean {
  return permission === 'comment' || permission === 'edit' || permission === 'suggest'
}

/** Pure expiry check (unit-tested): a share is expired when expiresAt is set and
 *  strictly before `now`. A null expiresAt never expires. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() < now.getTime()
}

/**
 * Create a share for a doc (owner-scoped). Generates a 32-byte base64url token;
 * hashes the password with argon2 when provided. Returns { id, token }.
 */
export async function createShare(
  ownerId: string,
  docId: string,
  opts: { permission: Permission; password?: string; expiresAt?: Date | null },
): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')
  const passwordHash =
    opts.password && opts.password.length > 0 ? await hash(opts.password, ARGON_OPTIONS) : null

  const [row] = await db
    .insert(schema.shares)
    .values({
      ownerId,
      docId,
      token,
      permission: opts.permission,
      passwordHash,
      expiresAt: opts.expiresAt ?? null,
    })
    .returning({ id: schema.shares.id })

  if (!row) throw new Error('createShare: insert returned no row')
  return { id: row.id, token }
}

/** All shares for a doc (owner-scoped), newest first — for the manage dialog.
 *  Returns full rows including passwordHash; the API maps to a safe client shape
 *  and NEVER sends the hash to the client. */
export async function listShares(ownerId: string, docId: string): Promise<Share[]> {
  return db
    .select()
    .from(schema.shares)
    .where(and(eq(schema.shares.docId, docId), eq(schema.shares.ownerId, ownerId)))
    .orderBy(desc(schema.shares.createdAt))
}

/** Revoke (delete) a share (owner-scoped). A no-op when the share isn't owned by
 *  ownerId (the owner-scoped predicate matches no row). */
export async function revokeShare(ownerId: string, shareId: string): Promise<void> {
  await db
    .delete(schema.shares)
    .where(and(eq(schema.shares.id, shareId), eq(schema.shares.ownerId, ownerId)))
}

/**
 * Resolve a token → the share IF valid (exists + not expired). Returns null
 * otherwise. Does NOT check the password (the caller does, via
 * verifySharePassword) so the data path stays a single, auditable gate.
 * NEVER returns an expired or missing share.
 */
export async function resolveShare(token: string): Promise<Share | null> {
  if (!token) return null
  const [share] = await db
    .select()
    .from(schema.shares)
    .where(eq(schema.shares.token, token))
    .limit(1)

  if (!share) return null
  if (isExpired(share.expiresAt)) return null
  return share
}

/**
 * Verify a share's password (argon2). Returns true when the share has no
 * password OR the supplied password matches. A null/empty supplied password
 * against a password-protected share returns false.
 */
export async function verifySharePassword(share: Share, password: string | null): Promise<boolean> {
  if (share.passwordHash === null) return true
  if (password === null || password.length === 0) return false
  try {
    return await verify(share.passwordHash, password)
  } catch {
    // Malformed/legacy hash — treat as a non-match rather than throwing.
    return false
  }
}
