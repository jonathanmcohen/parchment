import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { readAtCommit } from '@/lib/git/repo'

export const dynamic = 'force-dynamic'

// F4: GET /api/docs/[id]/git-show?oid=<commit> — the doc's mirrored file content
// at a specific commit (read-only preview of a historical version). Auth +
// ownership; 400 if oid missing, 404 if the doc has no disk_path or the blob
// isn't found at that commit. Best-effort: readAtCommit never throws.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ content: string } | { error: string }>> {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const oid = req.nextUrl.searchParams.get('oid')
  if (!oid) return NextResponse.json({ error: 'missing_oid' }, { status: 400 })
  if (!doc.diskPath) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const content = await readAtCommit(doc.diskPath, oid)
  if (content === null) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ content })
}
