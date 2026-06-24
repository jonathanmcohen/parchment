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
 *
 * CF1: body-parse + setWorkspaceTheme are wrapped so the deploy failure is
 * DIAGNOSABLE — a malformed JSON body returns a 400 with a clear message
 * (not an opaque 500), and a genuine server-side failure (e.g. the DB write)
 * is logged with detail and returns a 500. parseTheme still runs inside
 * setWorkspaceTheme (it normalizes rather than rejecting, so a structurally
 * valid object never 400s — only unparseable JSON does).
 */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  try {
    const theme = await setWorkspaceTheme(user.id, body)
    return NextResponse.json({ ok: true, theme })
  } catch (err) {
    console.error('PUT /api/settings/theme failed to persist theme:', err)
    return NextResponse.json({ error: 'failed to save theme' }, { status: 500 })
  }
}
