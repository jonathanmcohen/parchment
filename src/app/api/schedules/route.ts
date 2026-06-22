import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { scheduler } from '@/lib/schedules/scheduler'

export const dynamic = 'force-dynamic'

// I10 — GET /api/schedules → the live scheduler state (same process). Admin/auth
// gated: at v0.1 the single owner is the admin, so any authenticated user passes.
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  return NextResponse.json({ ok: true, jobs: scheduler.getState() })
}
