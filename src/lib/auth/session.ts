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

// A pending (password-passed, second-factor-not-yet-supplied) session is
// short-lived: the user must complete the 2FA step within this window.
const PENDING_TTL_SECONDS = 60 * 10 // 10 minutes
const PENDING_TTL_MS = PENDING_TTL_SECONDS * 1000

export type SessionUser = typeof schema.users.$inferSelect

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function setSessionCookie(token: string, expiresAt: Date, maxAge: number): Promise<void> {
  return cookies().then((store) => {
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
      expires: expiresAt,
    })
  })
}

// Creates a FULL session row + sets the httpOnly cookie. Used after the password
// step when the user has no second factor, or after a second factor is verified.
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(schema.sessions).values({ userId, tokenHash, expiresAt, mfaPending: false })

  await setSessionCookie(token, expiresAt, SESSION_TTL_SECONDS)
}

// Creates a PENDING session (mfaPending=true) after a correct password but BEFORE
// the second factor. The guard treats this as unauthenticated for app/API
// routes; only the 2FA-verify / passkey-auth routes accept it. Short TTL.
export async function createPendingSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS)

  await db.insert(schema.sessions).values({ userId, tokenHash, expiresAt, mfaPending: true })

  await setSessionCookie(token, expiresAt, PENDING_TTL_SECONDS)
}

// Reads the session cookie and returns the live user, or null. Resolves a token
// only when its session row is present, unexpired, AND fully authenticated
// (mfaPending=false). Pending sessions are NOT a logged-in user.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  return getUserByToken(token)
}

// Shared lookup used by both the cookie reader and the API request guard.
// Returns null for missing/expired sessions AND for pending (pre-2FA) sessions.
export async function getUserByToken(token: string): Promise<SessionUser | null> {
  const tokenHash = sha256(token)

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.sessions.mfaPending, false),
      ),
    )
    .limit(1)

  if (!session) return null

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1)

  return user ?? null
}

// Resolves the user id of the current PENDING session (mfaPending=true, unexpired),
// or null. Used ONLY by the 2FA-verify / passkey-auth login routes to know which
// user is completing the second factor. Never returns a fully-authed session.
export async function getPendingUserId(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const [session] = await db
    .select({ userId: schema.sessions.userId })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, sha256(token)),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.sessions.mfaPending, true),
      ),
    )
    .limit(1)

  return session?.userId ?? null
}

// Promotes the current pending session to a full session: clears mfaPending and
// extends the expiry to the full session TTL. Returns true if a pending session
// was found and promoted. Called after a successful second factor.
export async function promotePendingSession(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return false

  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  const updated = await db
    .update(schema.sessions)
    .set({ mfaPending: false, expiresAt })
    .where(and(eq(schema.sessions.tokenHash, tokenHash), eq(schema.sessions.mfaPending, true)))
    .returning({ id: schema.sessions.id })

  if (updated.length === 0) return false

  // Re-issue the cookie with the extended expiry; the token value is unchanged.
  await setSessionCookie(token, expiresAt, SESSION_TTL_SECONDS)
  return true
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
