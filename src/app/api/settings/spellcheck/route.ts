import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getSpellcheckEnabled, setSpellcheckEnabled } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** K6: GET /api/settings/spellcheck → { enabled: boolean } (default true). */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const enabled = await getSpellcheckEnabled(user.id)
  return NextResponse.json({ enabled })
}

/** K6: PUT /api/settings/spellcheck { enabled: boolean } → { ok: true, enabled }. */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { enabled?: unknown }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }

  await setSpellcheckEnabled(user.id, body.enabled)
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
