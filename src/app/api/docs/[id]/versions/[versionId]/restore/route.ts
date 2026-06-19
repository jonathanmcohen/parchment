import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument, saveDocument } from '@/lib/docs/repo'
import { createVersion, getVersion } from '@/lib/docs/versions-repo'

export const dynamic = 'force-dynamic'

// POST /api/docs/[id]/versions/[versionId]/restore
// 1. Snapshots the current doc state first (so restore is reversible).
// 2. Writes the version's content + markdown back to the document.
// 3. Returns the restored content so the client can update the editor.
export async function POST(
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

  // Step 1: snapshot the pre-restore state so the user can undo the restore
  await createVersion(id, {
    kind: 'named',
    label: `Pre-restore snapshot (${new Date().toISOString()})`,
    content: doc.content,
    markdown: doc.markdown,
    authorId: user.id,
  })

  // Step 2: write the version's state back to the document
  await saveDocument(id, {
    contentJson: version.content,
    markdown: version.markdown,
  })

  // Step 3: return the restored content so the client can update the editor in-place
  return NextResponse.json({ content: version.content, markdown: version.markdown })
}
