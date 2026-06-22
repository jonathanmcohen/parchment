// I4 — POST /api/backup/s3-now → manually trigger the scheduled S3 backup.
//
// ADMIN-gated (it runs a cross-owner backup + upload). When S3 is configured the
// 's3-backup' job is registered, so runNow fires it and returns the refreshed
// state. When S3 is NOT configured the job does not exist → 400 s3_not_configured.

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { isS3Configured } from '@/lib/backup/s3'
import { scheduler } from '@/lib/schedules/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  if (!isS3Configured()) {
    return NextResponse.json({ error: 's3_not_configured' }, { status: 400 })
  }

  await scheduler.runNow('s3-backup')
  const state = scheduler.getState().find((j) => j.name === 's3-backup') ?? null
  return NextResponse.json({ ok: true, state })
}
