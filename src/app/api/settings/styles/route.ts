import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocStyles, setDocStyles } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/styles → { styles: NamedStyle[] } (defaults if unset) */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const styles = await getDocStyles(user.id)
  return NextResponse.json({ styles })
}

/** PUT /api/settings/styles { styles: NamedStyle[] } → { ok: true, styles } */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { styles?: unknown }
  const styles = await setDocStyles(user.id, body.styles)
  return NextResponse.json({ ok: true, styles })
}
