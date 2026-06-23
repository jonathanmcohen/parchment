import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { deleteWebhook, setActive } from '@/lib/docs/webhooks-repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

// DELETE /api/webhooks/:id — remove one of the owner's webhooks.
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const removed = await deleteWebhook(user.id, id)
  if (!removed) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/webhooks/:id — toggle a webhook's active flag. Body: { active }.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { active?: unknown }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'invalid_active' }, { status: 400 })
  }

  const updated = await setActive(user.id, id, body.active)
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, active: body.active })
}
