import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { addPasskey } from '@/lib/auth/mfa-repo'
import { rpContext, takeRegistrationChallenge } from '@/lib/auth/webauthn'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

type VerifyBody = { response?: unknown; label?: unknown }

// POST /api/auth/passkey/register/verify { response, label? } — finish the
// registration ceremony. Verifies the attestation against the stashed challenge
// and stores the new credential (id, public key, counter, transports).
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const expectedChallenge = await takeRegistrationChallenge()
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'challenge_expired' }, { status: 400 })
  }

  let body: VerifyBody
  try {
    body = (await req.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  if (typeof body.response !== 'object' || body.response === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { rpID, origin } = await rpContext()

  const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      // The browser-produced JSON is validated by the library against the
      // challenge/origin/rpID below; we pass it through after a shape check.
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch {
    return NextResponse.json({ error: 'verification_failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'not_verified' }, { status: 400 })
  }

  const { credential } = verification.registrationInfo
  const label =
    typeof body.label === 'string' && body.label.trim().length > 0
      ? body.label.trim().slice(0, 60)
      : 'Passkey'

  await addPasskey({
    id: credential.id,
    userId: user.id,
    // Store the COSE public key as base64url text.
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ? [...credential.transports] : null,
    label,
  })

  return NextResponse.json({ verified: true, id: credential.id, label })
}
