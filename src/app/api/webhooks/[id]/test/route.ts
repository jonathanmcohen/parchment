import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { sendTestWebhook } from '@/lib/integrations/webhook-dispatch'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

// POST /api/webhooks/:id/test — send a one-off test delivery to the webhook and
// report whether the receiver accepted it (owner-only). Unlike the trigger-path
// dispatch, this awaits the POST so the UI can show success/failure.
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  const result = await sendTestWebhook(user.id, id)
  if (result === null) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(result)
}
