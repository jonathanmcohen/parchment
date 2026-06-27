import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import { moveDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await params
  // moving a doc is a manage-level operation on the doc.
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { folderId?: unknown }
  const folderId =
    body.folderId === null ? null : typeof body.folderId === 'string' ? body.folderId : null

  try {
    // §7g: moveDocument verifies the target folder is owned by user.id; a foreign
    // or missing folder throws { status: 404 } → 404 (no existence leak).
    await moveDocument(id, folderId, user!.id)
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500
    return NextResponse.json({ error: 'not_found' }, { status: status === 404 ? 404 : 500 })
  }
  return new NextResponse(null, { status: 204 })
}
