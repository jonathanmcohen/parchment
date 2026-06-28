import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { getAppConfigJson } from '@/lib/config/repo'
import { scheduler } from '@/lib/schedules/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/backup/verify-status — the backup-verify scheduler job state
 * + the last verify result (verify.lastResult). Admin-only. backup-sync OWNS this
 * surface (§7l).
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const schedulerState = scheduler.getState().find((j) => j.name === 'backup-verify') ?? null
  const lastResult = (await getAppConfigJson('verify.lastResult')) ?? null

  return NextResponse.json({ schedulerState, lastResult })
}
