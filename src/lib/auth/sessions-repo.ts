import 'server-only'
import { createHash } from 'node:crypto'
import { and, desc, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db, schema } from '@/db'
import { SESSION_COOKIE } from '@/lib/auth/session'

// Read-only view of a user's active sessions for the Security page. NEVER exposes
// `tokenHash` — only safe metadata plus a `current` flag marking the session that
// owns the request's own cookie.
export type SessionView = {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Lists the user's live (unexpired, fully-authenticated) sessions, newest first.
// The session whose tokenHash matches the caller's cookie is flagged `current`.
// Pending (pre-2FA) sessions are excluded — they are not a signed-in device.
export async function listUserSessions(userId: string): Promise<SessionView[]> {
  const store = await cookies()
  const cookieToken = store.get(SESSION_COOKIE)?.value
  const currentHash = cookieToken ? sha256(cookieToken) : null

  const rows = await db
    .select({
      id: schema.sessions.id,
      tokenHash: schema.sessions.tokenHash,
      createdAt: schema.sessions.createdAt,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.sessions.mfaPending, false),
      ),
    )
    .orderBy(desc(schema.sessions.createdAt))

  // The tokenHash is used ONLY to compute the `current` flag here; it is dropped
  // from the returned shape so it never leaves the server.
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    current: currentHash !== null && r.tokenHash === currentHash,
  }))
}

// G5 §6.1 — revoke a single session by id, SCOPED to userId so a user can only kill
// their OWN sessions (cross-user revoke is impossible — the delete simply matches no
// row). Revoking the CURRENT session is allowed (acts as logout). Returns true iff a
// row was actually deleted.
//
// Security property — a revoked session is dead IMMEDIATELY: getUserByToken /
// getCurrentUser look the row up in the DB on every request (no in-memory session
// cache), so deleting the row makes the next request with that cookie return null.
// The DB row IS the authority; no token blacklist is needed.
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)))
    .returning({ id: schema.sessions.id })
  return deleted.length > 0
}
