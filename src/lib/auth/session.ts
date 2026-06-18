import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db, schema } from '@/db'
import { env } from '@/lib/env'

export const SESSION_COOKIE = 'parchment_session'

// 30 days, in seconds and milliseconds.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000

export type SessionUser = typeof schema.users.$inferSelect

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Creates a session row + sets the httpOnly cookie. Returns the user's row.
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(schema.sessions).values({ userId, tokenHash, expiresAt })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    expires: expiresAt,
  })
}

// Reads the session cookie and returns the live user, or null. Resolves a token
// only when its session row is present and unexpired.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  return getUserByToken(token)
}

// Shared lookup used by both the cookie reader and the API request guard.
export async function getUserByToken(token: string): Promise<SessionUser | null> {
  const tokenHash = sha256(token)

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, new Date())))
    .limit(1)

  if (!session) return null

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1)

  return user ?? null
}

// Clears the current session: deletes the row (if any) and unsets the cookie.
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)))
  }

  store.delete(SESSION_COOKIE)
}
