import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { revokeShare } from '@/lib/docs/shares-repo'

export const dynamic = 'force-dynamic'

// DELETE /api/shares/[shareId] — revoke (delete) a share. Owner-scoped: the repo
// predicate (id AND ownerId) makes this a no-op for a share the caller doesn't
// own, so a non-owner can never revoke someone else's link.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ shareId: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { shareId } = await ctx.params
  await revokeShare(user.id, shareId)
  return NextResponse.json({ ok: true })
}
