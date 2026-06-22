import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { scheduler } from '@/lib/schedules/scheduler'

export const dynamic = 'force-dynamic'

// I10 — POST /api/schedules/:name/run → manually trigger one job now, then
// return the refreshed state. 404 for an unknown job. ADMIN-gated: triggering a
// job (e.g. trash-purge) runs a destructive sweep across ALL owners, so a plain
// authenticated user is not enough — the caller must hold an admin role.
export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { name } = await ctx.params
  const ran = await scheduler.runNow(name)
  if (!ran) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const state = scheduler.getState().find((j) => j.name === name) ?? null
  return NextResponse.json({ ok: true, state })
}
