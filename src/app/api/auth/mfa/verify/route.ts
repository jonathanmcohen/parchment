import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { verifyTotpStep } from '@/lib/auth/mfa'
import { consumeRecoveryCode, getMfa, recordTotpStep } from '@/lib/auth/mfa-repo'
import { clientIp, rateLimit } from '@/lib/auth/rate-limit'
import { consumePendingFailure, getPendingUserId, promotePendingSession } from '@/lib/auth/session'

type VerifyBody = { token?: unknown; recoveryCode?: unknown }

// Per-IP throttle: at most this many verify attempts per window. This is one of
// two independent brute-force bounds; the other (authoritative) bound is the
// per-pending-session attempt cap enforced via consumePendingFailure.
const VERIFY_RATE_LIMIT = 10
const VERIFY_RATE_WINDOW_SECONDS = 60

async function readBody(req: NextRequest): Promise<VerifyBody> {
  try {
    const body = await req.json()
    if (typeof body === 'object' && body !== null) return body as VerifyBody
  } catch {
    // fallthrough
  }
  return {}
}

// POST /api/auth/mfa/verify { token | recoveryCode } — the SECOND-FACTOR login
// step. Accepts ONLY a pending (mfaPending) session, verifies a TOTP code or
// consumes a single-use recovery code, then promotes the session to a full one.
//
// Brute force is bounded three ways, since an attacker reaching here already has
// the password: (1) a per-IP rate limit; (2) a hard per-pending-session attempt
// cap (consumePendingFailure) that destroys the pending session after N failures;
// (3) TOTP replay protection — an accepted code's time-step is recorded and any
// token at or below it is rejected (RFC-6238 §5.2).
export async function POST(req: NextRequest) {
  const ip = await clientIp()
  const rl = rateLimit(`mfa-verify:${ip}`, VERIFY_RATE_LIMIT, VERIFY_RATE_WINDOW_SECONDS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSeconds) } },
    )
  }

  const userId = await getPendingUserId()
  if (!userId) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  const body = await readBody(req)
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : ''

  let ok = false
  if (token.length > 0) {
    const row = await getMfa(userId)
    if (row?.totpEnabledAt != null && row.totpSecret != null) {
      const step = verifyTotpStep(row.totpSecret, token)
      // A null step is a wrong/expired code. A non-null step must be ADVANCED
      // past the last accepted one (recordTotpStep is conditional) or it is a
      // replay of an already-used live code — rejected either way.
      ok = step !== null && (await recordTotpStep(userId, step))
    }
  } else if (recoveryCode.length > 0) {
    ok = await consumeRecoveryCode(userId, recoveryCode)
  }

  if (!ok) {
    // Count this failed attempt against the pending session; once the cap is
    // hit the session is destroyed and getPendingUserId returns null thereafter.
    const remaining = await consumePendingFailure()
    const status = remaining === 0 ? 401 : 400
    const error = remaining === 0 ? 'too_many_attempts' : 'invalid_code'
    return NextResponse.json({ error }, { status })
  }

  const promoted = await promotePendingSession()
  if (!promoted) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  await db.insert(schema.auditLog).values({
    actorId: userId,
    action: 'login',
    targetType: 'user',
    targetId: userId,
    meta: { factor: token.length > 0 ? 'totp' : 'recovery_code' },
  })

  return NextResponse.json({ ok: true })
}
