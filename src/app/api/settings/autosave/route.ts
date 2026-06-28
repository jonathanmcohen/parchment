import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getAutosaveInterval, setAutosaveInterval } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/autosave → { ms: number } */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const ms = await getAutosaveInterval(user.id)
  return NextResponse.json({ ms })
}

/** PUT /api/settings/autosave { ms: number } → { ok: true } */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { ms?: unknown }
  const raw = body.ms
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return NextResponse.json({ error: 'ms must be a number' }, { status: 400 })
  }

  await setAutosaveInterval(user.id, raw)
  return NextResponse.json({ ok: true })
}
