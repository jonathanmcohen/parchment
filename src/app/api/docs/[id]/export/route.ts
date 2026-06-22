import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { exportDoc, exportFilename, parseExportFormat } from '@/lib/export'

export const dynamic = 'force-dynamic'

/** GET /api/docs/[id]/export?format=md|txt|html
 *
 * H3/H4/H7: Download the document in the requested format.
 * Owner-scoped — only the document owner may export (404 for non-owned docs).
 * Returns Content-Disposition: attachment with a filesystem-safe filename.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const format = parseExportFormat(req.nextUrl.searchParams.get('format'))
  if (!format) return NextResponse.json({ error: 'bad format' }, { status: 400 })

  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Normalize null content (newly created / unset docs) to an empty doc so
  // serializeMarkdown and other exporters never receive null and throw.
  const content = doc.content ?? { type: 'doc', content: [] }
  const { body, contentType, ext } = exportDoc(content, doc.title, format)
  const filename = exportFilename(doc.title, ext)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
