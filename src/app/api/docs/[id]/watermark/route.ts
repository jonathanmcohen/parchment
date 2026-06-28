import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { setDocumentWatermark } from '@/lib/docs/repo'
import { parseWatermark } from '@/lib/editor/watermark'

export const dynamic = 'force-dynamic'

/** PUT /api/docs/[id]/watermark { watermark: WatermarkConfig } → { ok: true }
 *
 * G9: Persists the doc-level watermark into documents.meta.watermark.
 * Owner-scoped — only the document owner may update.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { watermark?: unknown }
  const cfg = parseWatermark(body.watermark)

  const updated = await setDocumentWatermark(user.id, id, cfg)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
