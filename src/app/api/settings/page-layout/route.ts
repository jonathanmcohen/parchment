import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getPageLayoutMode, setPageLayoutMode } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/page-layout → { mode: 'continuous' | 'paged' } */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const mode = await getPageLayoutMode(user.id)
  return NextResponse.json({ mode })
}

/** PUT /api/settings/page-layout { mode: 'continuous' | 'paged' } → { ok: true, mode } */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  let body: { mode?: unknown }
  try {
    body = (await req.json()) as { mode?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const raw = body.mode
  if (raw !== 'continuous' && raw !== 'paged') {
    return NextResponse.json({ error: "mode must be 'continuous' or 'paged'" }, { status: 400 })
  }

  const mode = await setPageLayoutMode(user.id, raw)
  return NextResponse.json({ ok: true, mode })
}
