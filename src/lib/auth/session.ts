import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, ne, sql } from 'drizzle-orm'
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

// Hard cap on failed second-factor attempts per pending session. After this many
// wrong TOTP/recovery codes the pending session is destroyed and the user must
// re-authenticate with their password. This bounds online brute force of the
// second factor (which would otherwise have the whole 10-minute pending TTL) to
// a small, fixed number of guesses — independent of (and in addition to) the
// in-process per-IP rate limiter.
export const MFA_MAX_ATTEMPTS = 5

export type SessionUser = typeof schema.users.$inferSelect

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function setSessionCookie(token: string, expiresAt: Date, maxAge: number): Promise<void> {
  return cookies().then((store) => {
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      // CF1: Secure in production, OR when the operator opts in via
      // SECURE_COOKIES=true (e.g. the homelab deploy behind TLS where the
      // container does not set NODE_ENV=production). Never a hard `true` — that
      // would drop the cookie on local http dev.
      secure: env.nodeEnv === 'production' || env.secureCookies,
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

// Promotes the current pending session to a full session by ROTATING the token:
// mints a fresh randomBytes token + a new full session row and DELETES the old
// pending row. Returns true if a pending session was found and promoted.
//
// Rotating (rather than flipping mfaPending in place) is the key step: the bearer
// token that authenticated only the password phase must NOT survive as the
// fully-authenticated 30-day token. Any party that observed/fixated the pending
// token (referrer/log leak, shared device) is left holding a now-deleted value,
// not a post-2FA session. This mirrors createSession, which always mints a new
// token on an authentication-level change.
export async function promotePendingSession(): Promise<boolean> {
  const store = await cookies()
  const oldToken = store.get(SESSION_COOKIE)?.value
  if (!oldToken) return false

  const oldHash = sha256(oldToken)

  // Atomically claim the pending row by deleting it; only proceed if a live
  // pending row actually existed (guards against double-promote / a stale cookie).
  const deleted = await db
    .delete(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, oldHash),
        eq(schema.sessions.mfaPending, true),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .returning({ userId: schema.sessions.userId })

  const userId = deleted[0]?.userId
  if (!userId) return false

  // Fresh token + new full session row.
  const newToken = randomBytes(32).toString('base64url')
  const newHash = sha256(newToken)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: newHash,
    expiresAt,
    mfaPending: false,
  })

  await setSessionCookie(newToken, expiresAt, SESSION_TTL_SECONDS)
  return true
}

// Records one FAILED second-factor attempt against the current pending session.
// Increments the per-session failure counter; once it reaches MFA_MAX_ATTEMPTS
// the pending session is DESTROYED (row deleted + cookie cleared) so no further
// guesses are possible without re-running the password step. Returns the number
// of attempts remaining (0 means the session was just invalidated). A no-op
// returning 0 if there is no live pending session.
export async function consumePendingFailure(): Promise<number> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return 0

  const tokenHash = sha256(token)
  const updated = await db
    .update(schema.sessions)
    .set({ failedMfaAttempts: sql`${schema.sessions.failedMfaAttempts} + 1` })
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        eq(schema.sessions.mfaPending, true),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .returning({ attempts: schema.sessions.failedMfaAttempts })

  const attempts = updated[0]?.attempts
  if (attempts === undefined) return 0

  if (attempts >= MFA_MAX_ATTEMPTS) {
    // Burn the pending session: delete the row and clear the cookie.
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))
    store.delete(SESSION_COOKIE)
    return 0
  }
  return MFA_MAX_ATTEMPTS - attempts
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

// V3: revoke all of a user's sessions EXCEPT the one making the current request.
// Called after a password change so that any OTHER live session (a second
// device, or an attacker who copied a session token) stops working — that is the
// whole point of rotating a password as a remediation step. The current session
// is preserved so the user is not logged out of the device they just used.
//
// Fail-safe: on an authenticated request requireSessionUser has already
// validated the cookie, so the current token is always present here. If it
// somehow is not, revoke ALL of the user's sessions rather than leave stale ones
// alive (logging out is the safe failure for a password rotation).
export async function revokeOtherSessions(userId: string): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    await db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.tokenHash, sha256(token))))
    return
  }

  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId))
}
