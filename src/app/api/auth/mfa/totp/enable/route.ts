import { type NextRequest, NextResponse } from 'next/server'
import { logAuditRequest } from '@/lib/audit'
import { authenticateRequest } from '@/lib/auth/guard'
import { verifyTotpStep } from '@/lib/auth/mfa'
import { enableTotp, getMfa, recordTotpStep } from '@/lib/auth/mfa-repo'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

async function readToken(req: NextRequest): Promise<string> {
  try {
    const body = await req.json()
    if (typeof body === 'object' && body !== null && 'token' in body) {
      return String((body as { token: unknown }).token ?? '')
    }
  } catch {
    // fallthrough
  }
  return ''
}

// POST /api/auth/mfa/totp/enable { token } — confirm TOTP enrollment.
// Verifies a live code against the PROVISIONAL secret stored at /init; on success
// flips totpEnabledAt so the second factor takes effect on next login.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const row = await getMfa(user.id)
  if (!row?.totpSecret) {
    return NextResponse.json({ error: 'no_pending_enrollment' }, { status: 409 })
  }
  if (row.totpEnabledAt) {
    return NextResponse.json({ error: 'totp_already_enabled' }, { status: 409 })
  }

  const token = await readToken(req)
  const step = verifyTotpStep(row.totpSecret, token)
  if (step === null) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  await enableTotp(user.id)
  // Record the confirming code's step so it cannot be replayed as the first
  // login's second factor (RFC-6238 §5.2).
  await recordTotpStep(user.id, step)
  // §5.3: audit the second-factor enablement (canonical dotted verb 'mfa.enable').
  await logAuditRequest('mfa.enable', req, {
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
  })
  return NextResponse.json({ enabled: true })
}
