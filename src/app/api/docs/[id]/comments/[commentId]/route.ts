import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { deleteComment, setResolved } from '@/lib/docs/comments-repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string; commentId: string }> }

// PATCH /api/docs/[id]/comments/[commentId]
// Body: { resolved: boolean } → resolve/unresolve thread (requires 'comment')
//       { deleted: true }     → delete the comment      (requires 'manage')
//
// §7e IDOR: deleteComment/setResolved double-filter on (commentId, docId); a
// commentId belonging to another doc affects 0 rows → 404 (no existence leak).
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, commentId } = await ctx.params

  const body = (await req.json()) as { resolved?: boolean; deleted?: boolean }

  if (body.deleted === true) {
    // deleting a comment is a manage-level operation on the doc.
    const doc = await resolveDocAccess(user, id, 'manage')
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const affected = await deleteComment(commentId, id)
    if (affected === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  }

  if (typeof body.resolved === 'boolean') {
    // resolving a thread is a comment-level operation.
    const doc = await resolveDocAccess(user, id, 'comment')
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    // commentId here is the root comment (threadId) for resolve toggling
    const affected = await setResolved(commentId, id, body.resolved)
    if (affected === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 })
}

// DELETE /api/docs/[id]/comments/[commentId] — manage-level + IDOR. Provided as an
// explicit verb (the registry lists it) in addition to the PATCH { deleted } form.
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, commentId } = await ctx.params
  const doc = await resolveDocAccess(user, id, 'manage')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const affected = await deleteComment(commentId, id)
  if (affected === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
