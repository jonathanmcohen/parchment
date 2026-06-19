import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listDocumentsInFolder } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docs?folder=<id|root>
 * Returns docs in the specified folder. 'root' or absent → root (folderId null).
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
