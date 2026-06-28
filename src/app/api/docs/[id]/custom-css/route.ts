import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { setDocumentCustomCss } from '@/lib/docs/repo'
import { parseCustomCss } from '@/lib/editor/custom-css'

export const dynamic = 'force-dynamic'

/** PUT /api/docs/[id]/custom-css { css } → { ok: true }
 *
 * G17: Persists the doc-level custom CSS into documents.meta.customCss.
 * Owner-scoped — only the document owner may update.
 * Stores the raw-but-parsed CSS; sanitize+scope happen at render time.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { css?: unknown }
  const css = parseCustomCss(body.css)

  const updated = await setDocumentCustomCss(user.id, id, css)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
