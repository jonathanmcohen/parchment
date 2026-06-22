import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { setDocumentWatermark } from '@/lib/docs/repo'
import { parseWatermark } from '@/lib/editor/watermark'

export const dynamic = 'force-dynamic'

/** PUT /api/docs/[id]/watermark { watermark: WatermarkConfig } → { ok: true }
 *
 * G9: Persists the doc-level watermark into documents.meta.watermark.
 * Owner-scoped — only the document owner may update.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await req.json()) as { watermark?: unknown }
  const cfg = parseWatermark(body.watermark)

  await setDocumentWatermark(user.id, id, cfg)
  return NextResponse.json({ ok: true })
}
