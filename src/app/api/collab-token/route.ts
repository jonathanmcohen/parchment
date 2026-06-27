import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocAccess } from '@/lib/authz/doc-access'
import { mintCollabToken } from '@/lib/collab/token'

export const dynamic = 'force-dynamic'

// H Task 15 — mint a SHORT-LIVED collab token for an authenticated editor so the
// Hocuspocus client can authenticate the WS handshake (cookies don't ride the WS).
// Session/PAT authenticated; the caller must have canEdit on the requested doc.
// The token is bound to that single doc + a short expiry (the collab server's
// onAuthenticate re-checks canEdit, so this is defense-in-depth, not the only gate).
//
// POST { docId } → { token, expiresIn } | 401 | 403 | 404.

const TTL_SEC = 600 // 10 minutes; the client refetches on reconnect.

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { docId?: unknown }
  const docId = typeof body.docId === 'string' ? body.docId : null
  if (!docId) return NextResponse.json({ error: 'docId required' }, { status: 400 })

  // Only an editor (or owner/admin) of THIS doc may co-edit over the collab socket.
  const access = await getDocAccess({ user }, docId)
  if (!access.canView) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!access.canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const token = mintCollabToken({ userId: user.id, docId }, TTL_SEC)
  return NextResponse.json({ token, expiresIn: TTL_SEC })
}
