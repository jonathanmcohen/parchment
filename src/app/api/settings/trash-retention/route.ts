import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getTrashRetentionDays, setTrashRetentionDays } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/trash-retention → { days: number } */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const days = await getTrashRetentionDays(user.id)
  return NextResponse.json({ days })
}

/** PUT /api/settings/trash-retention { days: number } → { ok: true } */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { days?: unknown }
  const raw = body.days
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return NextResponse.json({ error: 'days must be a number' }, { status: 400 })
  }

  await setTrashRetentionDays(user.id, raw)
  return NextResponse.json({ ok: true })
}
