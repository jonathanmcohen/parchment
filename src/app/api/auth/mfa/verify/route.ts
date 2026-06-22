import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { verifyTotp } from '@/lib/auth/mfa'
import { consumeRecoveryCode, getMfa } from '@/lib/auth/mfa-repo'
import { getPendingUserId, promotePendingSession } from '@/lib/auth/session'

type VerifyBody = { token?: unknown; recoveryCode?: unknown }

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
// On success the user is logged in; on failure the pending session is preserved
// so they can retry within its short TTL.
export async function POST(req: NextRequest) {
  const userId = await getPendingUserId()
  if (!userId) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  const body = await readBody(req)
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : ''

  let ok = false
  if (token.length > 0) {
    const row = await getMfa(userId)
    ok = row?.totpEnabledAt != null && row.totpSecret != null && verifyTotp(row.totpSecret, token)
  } else if (recoveryCode.length > 0) {
    ok = await consumeRecoveryCode(userId, recoveryCode)
  }

  if (!ok) return NextResponse.json({ error: 'invalid_code' }, { status: 400 })

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
