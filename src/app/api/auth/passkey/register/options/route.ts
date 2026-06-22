import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listPasskeys } from '@/lib/auth/mfa-repo'
import { RP_NAME, rpContext, storeRegistrationChallenge } from '@/lib/auth/webauthn'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// POST /api/auth/passkey/register/options — start a passkey registration ceremony
// for the signed-in user. Returns PublicKeyCredentialCreationOptionsJSON and
// stashes the challenge in a short-lived httpOnly cookie for the verify step.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { rpID } = await rpContext()
  const existing = await listPasskeys(user.id)

  // Dynamic-import keeps @simplewebauthn/server out of any client bundle.
  const { generateRegistrationOptions } = await import('@simplewebauthn/server')
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      ...(Array.isArray(p.transports)
        ? { transports: p.transports as ('ble' | 'internal' | 'nfc' | 'usb' | 'hybrid')[] }
        : {}),
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  await storeRegistrationChallenge(options.challenge)
  return NextResponse.json(options)
}
