import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocument, renameDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const body = (await req.json()) as { title?: unknown }
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'empty title' }, { status: 400 })
  }

  try {
    await renameDocument(user.id, id, body.title)
  } catch (err) {
    if (err instanceof Error && err.message === 'empty title') {
      return NextResponse.json({ error: 'empty title' }, { status: 400 })
    }
    throw err
  }

  // I6: the /files list (and its Recents/Starred/Shared views) is a server-
  // rendered RSC reading listDocumentsInFolder — without invalidating its cache,
  // a rename from the editor title bar only showed after a manual refresh. The
  // route is the right place to revalidate (renameDocument is a pure DB write).
  revalidatePath('/files')
  // The editor's own SSR title for this doc, so a reload reflects the new name.
  revalidatePath(`/d/${id}`)

  return NextResponse.json({ ok: true })
}
