import { NextResponse } from 'next/server'
import { listPasskeys } from '@/lib/auth/mfa-repo'
import { getPendingUserId } from '@/lib/auth/session'
import { rpContext, storeAuthChallenge } from '@/lib/auth/webauthn'

// POST /api/auth/passkey/auth/options — start a passkey assertion for the LOGIN
// step. Only callable with a pending (mfaPending) session, which scopes the
// allowCredentials to that user and rate-limits this to a real login attempt.
export async function POST() {
  const userId = await getPendingUserId()
  if (!userId) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  const { rpID } = await rpContext()
  const credentials = await listPasskeys(userId)
  if (credentials.length === 0) {
    return NextResponse.json({ error: 'no_passkeys' }, { status: 400 })
  }

  const { generateAuthenticationOptions } = await import('@simplewebauthn/server')
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((p) => ({
      id: p.id,
      ...(Array.isArray(p.transports)
        ? { transports: p.transports as ('ble' | 'internal' | 'nfc' | 'usb' | 'hybrid')[] }
        : {}),
    })),
    userVerification: 'preferred',
  })

  await storeAuthChallenge(options.challenge)
  return NextResponse.json(options)
}
