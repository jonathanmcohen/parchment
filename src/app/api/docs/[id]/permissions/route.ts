// A4: manage a doc's ACL. ALL methods require 'manage' access on the doc (owner or
// workspace admin) via authorizeDocRoute — sharing is never something an 'editor'
// doc-grant can do. The doc-role body value is validated against DOC_PERM_ROLES;
// 'owner'/'admin' are NOT doc-roles and are rejected 400.
import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import {
  grantDocPermission,
  listDocPermissions,
  revokeDocPermission,
} from '@/lib/docs/doc-permissions-repo'

export const dynamic = 'force-dynamic'

const DOC_PERM_ROLES = new Set(['viewer', 'commenter', 'editor'])

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })
  return NextResponse.json({ permissions: await listDocPermissions(id) })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { userId?: string; role?: string }
  if (!body.userId || !body.role || !DOC_PERM_ROLES.has(body.role))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  // IDOR guard: never let the owner grant to themselves or grant the doc owner a
  // (lesser) role on their own doc — the owner is implicit and full-control.
  if (body.userId === gate.doc.ownerId)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // user must exist (handled by FK; a non-existent userId 23503-errors → map to 400)
  try {
    await grantDocPermission({
      docId: id,
      userId: body.userId,
      role: body.role as 'viewer' | 'commenter' | 'editor',
      grantedBy: user!.id,
    })
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  await logAudit('doc.share', {
    actorId: user!.id,
    targetType: 'document',
    targetId: id,
    meta: { userId: body.userId, role: body.role },
  })
  return new NextResponse(null, { status: 201 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { userId?: string }
  if (!body.userId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  await revokeDocPermission(id, body.userId)
  await logAudit('doc.unshare', {
    actorId: user!.id,
    targetType: 'document',
    targetId: id,
    meta: { userId: body.userId },
  })
  return new NextResponse(null, { status: 204 })
}
