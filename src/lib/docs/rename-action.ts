'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/guard'
import { getDocument, renameDocument } from '@/lib/docs/repo'

// P3 (v0.1.7): the editor's inline-title rename runs through a Server Action so
// Next's action-response cache invalidation reaches the CLIENT Router Cache —
// fixing the stale /files title that a route-handler revalidatePath could not
// bust. Route handlers revalidate the server cache only; the prior router.refresh
// workaround only refreshed the editor's OWN route, not the sibling /files entry,
// so a client-nav to /files lagged the DB by one rename.
//
// The legacy POST /api/docs/:id/rename route stays for FileManager's row rename
// (which re-fetches into local state and does not depend on the Router Cache).
export async function renameDocumentAction(
  docId: string,
  title: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser()

  const trimmed = title.trim()
  if (trimmed.length === 0) return { error: 'empty title' }

  const doc = await getDocument(docId)
  if (!doc || doc.ownerId !== user.id) return { error: 'not found' }

  try {
    await renameDocument(user.id, docId, trimmed)
  } catch (err) {
    if (err instanceof Error && err.message === 'empty title') {
      return { error: 'empty title' }
    }
    throw err
  }

  // A Server Action's revalidatePath is streamed back in the action response, so
  // the client Router Cache marks these paths stale — the next client-nav to
  // /files (or the sidebar) renders the fresh title with no manual reload.
  revalidatePath('/files')
  revalidatePath(`/d/${docId}`)

  return { ok: true }
}
