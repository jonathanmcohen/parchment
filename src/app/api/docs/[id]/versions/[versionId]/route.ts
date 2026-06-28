import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { getVersion } from '@/lib/docs/versions-repo'

export const dynamic = 'force-dynamic'

// GET /api/docs/[id]/versions/[versionId] — full version with content + markdown
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id, versionId } = await ctx.params
  const doc = await resolveDocAccess(user, id, 'view')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // §7e IDOR: getVersion double-filters on (versionId, docId) — a versionId on a
  // different doc returns null → 404, never leaking that the version exists.
  const version = await getVersion(versionId, id)
  if (!version) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(version)
}
