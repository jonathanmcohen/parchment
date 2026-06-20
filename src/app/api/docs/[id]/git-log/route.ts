import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { type GitCommit, logForPath } from '@/lib/git/repo'

export const dynamic = 'force-dynamic'

// F4: GET /api/docs/[id]/git-log — the disk-mirror git history for this doc,
// newest-first. Auth + ownership; if the doc has no disk_path (never mirrored)
// or the repo has no commits for it, return []. Best-effort: logForPath never
// throws.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<GitCommit[] | { error: string }>> {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!doc.diskPath) return NextResponse.json([])

  const commits = await logForPath(doc.diskPath)
  return NextResponse.json(commits)
}
