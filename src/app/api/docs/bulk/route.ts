import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { parseBulkRequest } from '@/lib/docs/bulk-action'
import {
  deleteDocumentPermanently,
  getDocument,
  moveDocument,
  restoreDocument,
  trashDocument,
} from '@/lib/docs/repo'
import { addTagToDoc } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const parsed = parseBulkRequest((await req.json()) as Record<string, unknown>)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  let affected = 0

  for (const id of parsed.ids) {
    // Confirm ownership — skip ids that don't belong to this user (no existence leak).
    const doc = await getDocument(id)
    if (!doc || doc.ownerId !== user.id) continue

    switch (parsed.action) {
      case 'move': {
        // §7g: moveDocument verifies the target folder is owned by user.id; a foreign
        // folder throws 404 → skip that id rather than aborting the whole batch.
        try {
          await moveDocument(id, parsed.folderId, user.id)
          affected++
        } catch {
          // foreign/missing target folder — skip this id
        }
        break
      }
      case 'trash': {
        await trashDocument(user.id, id)
        affected++
        break
      }
      case 'restore': {
        // J11-1: only meaningful for a trashed doc; restoreDocument is a no-op on a
        // live doc, so we count it as affected only when it was actually trashed.
        if (doc.trashedAt !== null) {
          await restoreDocument(user.id, id)
          affected++
        }
        break
      }
      case 'delete': {
        // J11-1: PERMANENT delete — only from trash. deleteDocumentPermanently gates
        // on owned-AND-trashed and returns false otherwise; it also removes the disk
        // mirror + asset directory.
        const removed = await deleteDocumentPermanently(user.id, id)
        if (removed) affected++
        break
      }
      case 'tag': {
        // addTagToDoc handles tag ownership verification internally.
        try {
          await addTagToDoc(user.id, id, parsed.tagId)
          affected++
        } catch {
          // tag or doc ownership check failed — skip
        }
        break
      }
    }
  }

  return NextResponse.json({ ok: true, affected })
}
