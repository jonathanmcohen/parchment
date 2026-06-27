import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getSpellcheckEnabled, setSpellcheckEnabled } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** K6: GET /api/settings/spellcheck → { enabled: boolean } (default true). */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const enabled = await getSpellcheckEnabled(user.id)
  return NextResponse.json({ enabled })
}

/** K6: PUT /api/settings/spellcheck { enabled: boolean } → { ok: true, enabled }. */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { enabled?: unknown }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }

  await setSpellcheckEnabled(user.id, body.enabled)
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
