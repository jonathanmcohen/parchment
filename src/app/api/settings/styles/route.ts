import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocStyles, setDocStyles } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/styles → { styles: NamedStyle[] } (defaults if unset) */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const styles = await getDocStyles(user.id)
  return NextResponse.json({ styles })
}

/** PUT /api/settings/styles { styles: NamedStyle[] } → { ok: true, styles } */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { styles?: unknown }
  const styles = await setDocStyles(user.id, body.styles)
  return NextResponse.json({ ok: true, styles })
}
