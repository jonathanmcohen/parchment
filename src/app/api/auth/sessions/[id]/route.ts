import { type NextRequest, NextResponse } from 'next/server'
import { logAuditRequest } from '@/lib/audit'
import { authenticateRequest } from '@/lib/auth/guard'
import { revokeSession } from '@/lib/auth/sessions-repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

// Revoking a session is session-only (like the GET list) — a PAT (Bearer) is for
// programmatic API use, not for managing the owner's browser sessions.
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// DELETE /api/auth/sessions/[id] — revoke one of the caller's OWN sessions. The
// delete is scoped to the caller's user id in revokeSession, so a user can never
// revoke another user's session even by guessing an id. Revoking the current
// session is allowed (acts as logout) — the row IS the authority, so the next
// request with that cookie returns null immediately.
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const deleted = await revokeSession(user.id, id)
  if (!deleted) {
    // No matching row for this user — already gone or never theirs. 404 (a scoped
    // miss), not 403, so we don't confirm another user's session id exists.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // §5.3 / §6.1: audit the revoke (canonical dotted verb 'session.revoke').
  await logAuditRequest('session.revoke', req, {
    actorId: user.id,
    targetType: 'session',
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
