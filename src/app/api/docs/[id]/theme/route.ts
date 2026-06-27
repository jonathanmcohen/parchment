import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { setDocumentTheme } from '@/lib/docs/repo'
import { parseDocTheme } from '@/lib/editor/doc-theme'

export const dynamic = 'force-dynamic'

/** PUT /api/docs/[id]/theme { theme } → { ok: true }
 *
 * J12-2: Persists the per-doc theme override into documents.meta.theme. The body's
 * `theme` is run through parseDocTheme (the allow-list trust boundary) so ONLY the
 * three validated token-driving fields (preset / accent / pageBg) are stored — no
 * arbitrary CSS can be persisted here. An empty/invalid theme clears the override.
 * Owner-scoped — mutating (docs:write); a foreign/missing doc returns 404.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { theme?: unknown }
  const theme = parseDocTheme(body.theme)

  const updated = await setDocumentTheme(user.id, id, theme as Record<string, unknown>)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
