import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getWorkspaceTheme, setWorkspaceTheme } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/theme → WorkspaceTheme (accent, fontPair, colorScheme, pageBg) */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const theme = await getWorkspaceTheme(user.id)
  return NextResponse.json(theme)
}

/**
 * PUT /api/settings/theme { accent, fontPair, colorScheme, pageBg } → { ok: true, theme }
 * I1: colorScheme + pageBg validated by parseTheme inside setWorkspaceTheme.
 */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as unknown
  const theme = await setWorkspaceTheme(user.id, body)
  return NextResponse.json({ ok: true, theme })
}
