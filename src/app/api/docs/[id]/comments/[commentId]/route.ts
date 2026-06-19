import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { deleteComment, setResolved } from '@/lib/docs/comments-repo'
import { getDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string; commentId: string }> }

// PATCH /api/docs/[id]/comments/[commentId]
// Body: { resolved: boolean } → resolve/unresolve thread
//       { deleted: true }     → delete the comment
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, commentId } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json()) as { resolved?: boolean; deleted?: boolean }

  if (body.deleted === true) {
    await deleteComment(commentId)
    return new NextResponse(null, { status: 204 })
  }

  if (typeof body.resolved === 'boolean') {
    // commentId here is the root comment (threadId) for resolve toggling
    await setResolved(commentId, body.resolved)
    return new NextResponse(null, { status: 204 })
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 })
}
