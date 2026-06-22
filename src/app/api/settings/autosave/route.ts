import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getAutosaveInterval, setAutosaveInterval } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/autosave → { ms: number } */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ms = await getAutosaveInterval(user.id)
  return NextResponse.json({ ms })
}

/** PUT /api/settings/autosave { ms: number } → { ok: true } */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { ms?: unknown }
  const raw = body.ms
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return NextResponse.json({ error: 'ms must be a number' }, { status: 400 })
  }

  await setAutosaveInterval(user.id, raw)
  return NextResponse.json({ ok: true })
}
