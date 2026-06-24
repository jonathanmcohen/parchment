import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { parseChangePasswordBody, validateNewPassword } from '@/lib/auth/password-policy'
import { clientIp, rateLimit } from '@/lib/auth/rate-limit'
import { revokeOtherSessions } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// V4: bound how fast the current-password check can be brute-forced. argon2id
// verification is already costly, but a caller holding a live session must not
// get unlimited guesses — mirrors the MFA / passkey verify throttle. Tighter
// than those (5 vs 10) because a legitimate password change needs only a couple
// of attempts and argon2id makes each guess expensive to serve.
const PASSWORD_VERIFY_LIMIT = 5
const PASSWORD_VERIFY_WINDOW_SECONDS = 60

// Change-password is owner-only and guarded by a LIVE cookie session — a PAT
// (Bearer) must never be able to rotate the account password.
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// POST /api/auth/password { currentPassword, newPassword } — rotate the
// account password. Verifies the current password against the stored argon2id
// hash, validates the new password length, then hashes + persists the new one.
// Errors are intentionally coarse (no detail about which check failed beyond the
// validation/auth boundary) and never echo a hash.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // V4: per-IP throttle BEFORE the expensive verify. The session requirement
  // above is the primary gate; this slows credential guessing if a session is
  // compromised. Best-effort (in-process, IP-keyed) — the IP is proxy-spoofable,
  // so it is one layer, not the only one.
  const ip = await clientIp()
  const rl = rateLimit(
    `password-verify:${ip}`,
    PASSWORD_VERIFY_LIMIT,
    PASSWORD_VERIFY_WINDOW_SECONDS,
  )
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const input = parseChangePasswordBody(body)
  if (!input) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const policyError = validateNewPassword(input.newPassword)
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

  // An account with no password set cannot "change" one via this route.
  if (!user.passwordHash) {
    return NextResponse.json({ error: 'no_password_set' }, { status: 409 })
  }

  const ok = await verifyPassword(user.passwordHash, input.currentPassword)
  if (!ok) return NextResponse.json({ error: 'invalid_current_password' }, { status: 400 })

  const newHash = await hashPassword(input.newPassword)
  await db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, user.id))

  // V3: a password rotation must invalidate every OTHER live session (a second
  // device, or a stolen session token) — otherwise rotating the password does
  // not actually lock an attacker out. The current session is kept so the user
  // stays signed in on this device.
  await revokeOtherSessions(user.id)

  return NextResponse.json({ ok: true })
}
