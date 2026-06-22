import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { generateRecoveryCodes, generateTotpSecret, totpUri } from '@/lib/auth/mfa'
import { getMfa, hashRecoveryCodes, setTotp } from '@/lib/auth/mfa-repo'

// Session-only: a PAT must not be able to enroll a second factor.
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// POST /api/auth/mfa/totp/init — begin TOTP enrollment.
// Generates a PROVISIONAL secret + recovery codes, persists the secret (not yet
// enabled) and the argon2-hashed recovery codes, and returns the otpauth URI, a
// QR data-URL, and the PLAINTEXT recovery codes (shown exactly once). The secret
// is returned only so the authenticator app can be set up; it is never logged.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const existing = await getMfa(user.id)
  if (existing?.totpEnabledAt) {
    return NextResponse.json({ error: 'totp_already_enabled' }, { status: 409 })
  }

  const secret = generateTotpSecret()
  const recoveryCodes = generateRecoveryCodes()
  const uri = totpUri(secret, user.email)

  // Server-only crypto libs are dynamic-imported so they never enter a client
  // bundle. `qrcode` renders the provisioning URI to an inline data-URL.
  const { toDataURL } = await import('qrcode')
  const qrDataUrl = await toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1 })

  const recoveryHashes = await hashRecoveryCodes(recoveryCodes)
  await setTotp(user.id, secret, recoveryHashes)

  return NextResponse.json({ uri, qrDataUrl, recoveryCodes })
}
