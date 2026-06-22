import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { scheduler } from '@/lib/schedules/scheduler'

export const dynamic = 'force-dynamic'

// I10 — GET /api/schedules → the live scheduler state (same process). ADMIN-gated:
// scheduler internals are an operational/admin concern, so a plain authenticated
// user is not enough — the caller must hold an admin role.
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  return NextResponse.json({ ok: true, jobs: scheduler.getState() })
}
