import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { bumpPasskeyCounter, getPasskeyById } from '@/lib/auth/mfa-repo'
import { getPendingUserId, promotePendingSession } from '@/lib/auth/session'
import { rpContext, takeAuthChallenge } from '@/lib/auth/webauthn'

type VerifyBody = { response?: unknown }

// POST /api/auth/passkey/auth/verify { response } — finish the LOGIN passkey
// ceremony. Accepts only a pending session, verifies the assertion against the
// stashed challenge and the stored credential, bumps the signature counter, and
// promotes the pending session to a full one.
export async function POST(req: NextRequest) {
  const userId = await getPendingUserId()
  if (!userId) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  const expectedChallenge = await takeAuthChallenge()
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'challenge_expired' }, { status: 400 })
  }

  let body: VerifyBody
  try {
    body = (await req.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const response = body.response
  if (typeof response !== 'object' || response === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // The credential ID the browser asserted with.
  const credentialId =
    'id' in response && typeof (response as { id: unknown }).id === 'string'
      ? (response as { id: string }).id
      : ''
  const passkey = await getPasskeyById(credentialId)
  // Bind the credential to the user completing this login.
  if (!passkey || passkey.userId !== userId) {
    return NextResponse.json({ error: 'unknown_credential' }, { status: 400 })
  }

  const { rpID, origin } = await rpContext()
  const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        ...(Array.isArray(passkey.transports)
          ? { transports: passkey.transports as ('ble' | 'internal' | 'nfc' | 'usb' | 'hybrid')[] }
          : {}),
      },
      requireUserVerification: false,
    })
  } catch {
    return NextResponse.json({ error: 'verification_failed' }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'not_verified' }, { status: 400 })
  }

  await bumpPasskeyCounter(passkey.id, verification.authenticationInfo.newCounter)

  const promoted = await promotePendingSession()
  if (!promoted) return NextResponse.json({ error: 'no_pending_session' }, { status: 401 })

  await db.insert(schema.auditLog).values({
    actorId: userId,
    action: 'login',
    targetType: 'user',
    targetId: userId,
    meta: { factor: 'passkey' },
  })

  return NextResponse.json({ ok: true })
}
