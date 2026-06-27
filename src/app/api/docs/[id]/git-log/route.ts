import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { logForPath } from '@/lib/git/repo'

export const dynamic = 'force-dynamic'

// F4: GET /api/docs/[id]/git-log — the disk-mirror git history for this doc,
// newest-first. Auth + ownership; if the doc has no disk_path (never mirrored)
// or the repo has no commits for it, return []. Best-effort: logForPath never
// throws.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!doc.diskPath) return NextResponse.json([])

  const commits = await logForPath(doc.diskPath)
  return NextResponse.json(commits)
}
