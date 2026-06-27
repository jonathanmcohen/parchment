import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getTrashRetentionDays, setTrashRetentionDays } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/trash-retention → { days: number } */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const days = await getTrashRetentionDays(user.id)
  return NextResponse.json({ days })
}

/** PUT /api/settings/trash-retention { days: number } → { ok: true } */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { days?: unknown }
  const raw = body.days
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return NextResponse.json({ error: 'days must be a number' }, { status: 400 })
  }

  await setTrashRetentionDays(user.id, raw)
  return NextResponse.json({ ok: true })
}
