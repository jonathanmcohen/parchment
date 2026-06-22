import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getMfa } from '@/lib/auth/mfa-repo'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// GET /api/auth/mfa/totp — TOTP status for the signed-in user. Returns only
// non-secret flags (never the secret or recovery codes).
export async function GET(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const row = await getMfa(user.id)
  const recoveryCount = Array.isArray(row?.recoveryCodes) ? row.recoveryCodes.length : 0
  return NextResponse.json({
    enabled: row?.totpEnabledAt != null,
    recoveryCodesRemaining: row?.totpEnabledAt != null ? recoveryCount : 0,
  })
}
