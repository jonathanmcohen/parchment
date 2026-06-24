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
