'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { userHasSecondFactor } from '@/lib/auth/mfa-repo'
import { verifyPassword } from '@/lib/auth/password'
import { createPendingSession, createSession } from '@/lib/auth/session'

// `mfaRequired` drives the form to the second-factor step instead of completing.
// `hasPasskey` lets that step offer the passkey button (vs. only TOTP/recovery).
export type LoginState =
  | { error: string }
  | { mfaRequired: true; hasPasskey: boolean; hasTotp: boolean }
  | null

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Enter your email and password.' }

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
    return { error: 'Invalid email or password.' }
  }

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

  await db.insert(schema.auditLog).values({
    actorId: user.id,
    action: 'login',
    targetType: 'user',
    targetId: user.id,
  })

  await createSession(user.id)
  redirect('/')
}
