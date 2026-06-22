import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { verifyTotp } from '@/lib/auth/mfa'
import { disableTotp, getMfa } from '@/lib/auth/mfa-repo'
import { verifyPassword } from '@/lib/auth/password'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

type DisableBody = { token?: unknown; password?: unknown }

async function readBody(req: NextRequest): Promise<DisableBody> {
  try {
    const body = await req.json()
    if (typeof body === 'object' && body !== null) return body as DisableBody
  } catch {
    // fallthrough
  }
  return {}
}

// POST /api/auth/mfa/totp/disable { token | password } — turn off TOTP.
// Requires a FRESH re-auth: either a current authenticator code or the account
// password. This prevents an unattended/borrowed session from silently
// stripping the second factor.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const row = await getMfa(user.id)
  if (!row?.totpEnabledAt || !row.totpSecret) {
    return NextResponse.json({ error: 'totp_not_enabled' }, { status: 409 })
  }

  const body = await readBody(req)
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const okByToken = token.length > 0 && verifyTotp(row.totpSecret, token)
  const okByPassword =
    !okByToken &&
    password.length > 0 &&
    user.passwordHash != null &&
    (await verifyPassword(user.passwordHash, password))

  if (!okByToken && !okByPassword) {
    return NextResponse.json({ error: 'reauth_required' }, { status: 400 })
  }

  await disableTotp(user.id)
  return NextResponse.json({ disabled: true })
}
