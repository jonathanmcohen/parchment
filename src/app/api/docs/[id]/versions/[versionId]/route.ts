import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { getVersion } from '@/lib/docs/versions-repo'

export const dynamic = 'force-dynamic'

// GET /api/docs/[id]/versions/[versionId] — full version with content + markdown
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id, versionId } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const version = await getVersion(versionId)
  if (!version) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(version)
}
