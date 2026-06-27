'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { logAudit } from '@/lib/audit'
import { getLockoutStatus, recordLoginFailure, resetLoginLockout } from '@/lib/auth/lockout-repo'
import { userHasSecondFactor } from '@/lib/auth/mfa-repo'
import { verifyPassword } from '@/lib/auth/password'
import { clientIp, rateLimit } from '@/lib/auth/rate-limit'
import { createPendingSession, createSession } from '@/lib/auth/session'

// `mfaRequired` drives the form to the second-factor step instead of completing.
// `hasPasskey` lets that step offer the passkey button (vs. only TOTP/recovery).
export type LoginState =
  | { error: string }
  | { mfaRequired: true; hasPasskey: boolean; hasTotp: boolean }
  | null

// G4 — two INDEPENDENT brute-force bounds on the password step:
//   1. Per-IP fixed-window throttle (spoofable behind a proxy, so only one layer).
//   2. Per-account lockout in login_lockouts (authoritative — survives IP rotation).
// At most LOGIN_RATE_LIMIT password attempts per LOGIN_RATE_WINDOW_SECONDS per IP.
const LOGIN_RATE_LIMIT = 10
const LOGIN_RATE_WINDOW_SECONDS = 5 * 60

// Generic, identical error for every credential/lockout/throttle rejection — never
// an account-status or rate-limit oracle beyond a "try again later" hint.
const GENERIC_CREDENTIAL_ERROR = 'Invalid email or password.'
const THROTTLED_ERROR = 'Too many attempts. Please try again later.'

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Enter your email and password.' }

  const ip = await clientIp()

  // 1. Per-IP throttle FIRST: on trip, return before any argon2 work — saves CPU
  //    under a flood and removes a timing oracle. ip 'unknown' still keys a bucket.
  const rl = rateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_SECONDS)
  if (!rl.ok) return { error: THROTTLED_ERROR }

  // 2. Per-account lockout: if locked, reject BEFORE verifying the password (so a
  //    correct password during cooldown is still rejected) and skip argon2.
  if ((await getLockoutStatus(email)).locked) {
    return { error: THROTTLED_ERROR }
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)

  // Verify against the stored hash. A single generic error for both "no such
  // user" and "wrong password" avoids confirming which emails are registered.
  // A6: a disabled user is treated EXACTLY like a bad credential — no separate
  // "account disabled" message, which would be an account-status oracle.
  const ok =
    user && user.disabledAt === null && user.passwordHash
      ? await verifyPassword(user.passwordHash, password)
      : false

  if (!user || user.disabledAt !== null || !ok) {
    // Count this failure against the per-account lockout. We record even for an
    // unknown email so the lockout key space can't be probed for existence (the
    // hash is over the submitted email regardless of whether a user exists).
    const status = await recordLoginFailure(email)
    // Audit a fresh lockout trip — no email/PII in meta, ip only.
    if (status.locked) {
      await logAudit('login.locked', { targetType: 'account', ip })
    }
    return { error: GENERIC_CREDENTIAL_ERROR }
  }

  // Successful credential check → clear any accumulated failure counter.
  await resetLoginLockout(email)

  // SECOND-FACTOR GATE: when the user has an enabled TOTP and/or a passkey, the
  // password step does NOT issue a full session. We mint a short-lived PENDING
  // session (mfaPending=true) — which requireUser()/getCurrentUser() reject for
  // app routes — and return mfaRequired so the form advances to the 2FA step.
  // The session is promoted to a full one only by /api/auth/mfa/verify or the
  // passkey-auth verify route. Existing password-only login is unchanged.
  if (await userHasSecondFactor(user.id)) {
    const [mfa] = await db
      .select({ enabledAt: schema.userMfa.totpEnabledAt })
      .from(schema.userMfa)
      .where(eq(schema.userMfa.userId, user.id))
      .limit(1)
    const passkeys = await db
      .select({ id: schema.passkeys.id })
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, user.id))
      .limit(1)

    await createPendingSession(user.id)
    return {
      mfaRequired: true,
      hasTotp: mfa?.enabledAt != null,
      hasPasskey: passkeys.length > 0,
    }
  }

  // §5.3: hash-chained audit (with ip) instead of the prior raw db.insert.
  await logAudit('login', { actorId: user.id, targetType: 'user', targetId: user.id, ip })

  await createSession(user.id)
  redirect('/')
}
