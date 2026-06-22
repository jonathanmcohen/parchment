import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listPasskeys, removePasskey } from '@/lib/auth/mfa-repo'

async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// GET /api/auth/passkey — list the signed-in user's passkeys (metadata only;
// never the public key material is needed by the UI, but it is non-secret).
export async function GET(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const passkeys = await listPasskeys(user.id)
  return NextResponse.json({
    passkeys: passkeys.map((p) => ({ id: p.id, label: p.label, createdAt: p.createdAt })),
  })
}

// DELETE /api/auth/passkey { id } — remove one of the user's passkeys.
export async function DELETE(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let id = ''
  try {
    const body = await req.json()
    if (typeof body === 'object' && body !== null && 'id' in body) {
      id = String((body as { id: unknown }).id ?? '')
    }
  } catch {
    // fallthrough
  }
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  await removePasskey(user.id, id)
  return NextResponse.json({ removed: true })
}
