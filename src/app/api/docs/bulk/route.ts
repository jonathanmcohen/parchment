import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument, moveDocument, trashDocument } from '@/lib/docs/repo'
import { addTagToDoc } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

type BulkAction = 'move' | 'trash' | 'tag'

interface BulkBody {
  ids: unknown
  action: unknown
  folderId?: unknown
  tagId?: unknown
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as BulkBody

  // Validate ids is a non-empty array of strings
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    !body.ids.every((id) => typeof id === 'string')
  ) {
    return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
  }

  const ids = body.ids as string[]
  const action = body.action as BulkAction

  if (action !== 'move' && action !== 'trash' && action !== 'tag') {
    return NextResponse.json({ error: 'action must be move, trash, or tag' }, { status: 400 })
  }

  if (action === 'tag') {
    if (typeof body.tagId !== 'string' || !body.tagId) {
      return NextResponse.json({ error: 'tagId is required for tag action' }, { status: 400 })
    }
  }

  let affected = 0

  for (const id of ids) {
    // Confirm ownership — skip ids that don't belong to this user
    const doc = await getDocument(id)
    if (!doc || doc.ownerId !== user.id) continue

    if (action === 'move') {
      const folderId =
        body.folderId === null ? null : typeof body.folderId === 'string' ? body.folderId : null
      // §7g: moveDocument verifies the target folder is owned by user.id; a foreign
      // folder throws 404 → skip that id rather than aborting the whole batch.
      try {
        await moveDocument(id, folderId, user.id)
        affected++
      } catch {
        // foreign/missing target folder — skip this id
      }
    } else if (action === 'trash') {
      await trashDocument(user.id, id)
      affected++
    } else {
      // tag — addTagToDoc handles tag ownership verification internally
      try {
        await addTagToDoc(user.id, id, body.tagId as string)
        affected++
      } catch {
        // tag or doc ownership check failed — skip
      }
    }
  }

  return NextResponse.json({ ok: true, affected })
}
