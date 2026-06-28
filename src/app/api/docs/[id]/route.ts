import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import { saveDocument, trashDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'view')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })
  return NextResponse.json(gate.doc)
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'edit')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { contentJson?: unknown; markdown?: string; title?: string }
  await saveDocument(id, {
    contentJson: body.contentJson ?? {},
    markdown: String(body.markdown ?? ''),
    ...(body.title ? { title: body.title } : {}),
  })
  return new NextResponse(null, { status: 204 })
}

// DELETE soft-deletes the doc (trash). 'manage' access required: the doc owner or a
// workspace admin. A denied/missing doc is 404 (no existence oracle). trashDocument
// is owner-scoped at the repo layer, so an admin deleting another user's doc routes
// through the owner check — pass the doc's real ownerId resolved by the gate.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })
  await trashDocument(gate.doc.ownerId, id)
  return new NextResponse(null, { status: 204 })
}
