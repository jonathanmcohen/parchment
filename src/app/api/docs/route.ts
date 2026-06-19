import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listDocumentsInFolder, listRecents, listStarred, listTrashed } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docs?folder=<id|root>  — docs in the specified folder (existing behavior)
 * GET /api/docs?view=recents      — 30 most-recently-updated non-trashed docs
 * GET /api/docs?view=starred      — starred, non-trashed docs
 * GET /api/docs?view=trash        — trashed docs
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const view = req.nextUrl.searchParams.get('view')

  if (view === 'recents') {
    const docs = await listRecents(user.id)
    return NextResponse.json(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        updatedAt: d.updatedAt.toISOString(),
        starred: d.starred,
      })),
    )
  }

  if (view === 'starred') {
    const docs = await listStarred(user.id)
    return NextResponse.json(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        updatedAt: d.updatedAt.toISOString(),
        starred: d.starred,
      })),
    )
  }

  if (view === 'trash') {
    const docs = await listTrashed(user.id)
    return NextResponse.json(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        updatedAt: d.updatedAt.toISOString(),
        starred: d.starred,
      })),
    )
  }

  // Default: folder browse (existing behavior)
  const folderParam = req.nextUrl.searchParams.get('folder')
  const folderId = folderParam === 'root' || !folderParam ? null : folderParam

  const docs = await listDocumentsInFolder(user.id, folderId)
  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updatedAt.toISOString(),
      folderId: d.folderId,
    })),
  )
}
