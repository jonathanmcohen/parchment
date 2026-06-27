import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { exportDoc, exportFilename, parseExportFormat } from '@/lib/export'

export const dynamic = 'force-dynamic'

/** GET /api/docs/[id]/export?format=md|txt|html
 *
 * H3/H4/H7: Download the document in the requested format.
 * A4: any user with 'view' access (owner, admin, or a viewer+ doc-permission grant)
 * may export; a non-shared stranger gets 404 (no existence leak).
 * Returns Content-Disposition: attachment with a filesystem-safe filename.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const format = parseExportFormat(req.nextUrl.searchParams.get('format'))
  if (!format) return NextResponse.json({ error: 'bad format' }, { status: 400 })

  const doc = await resolveDocAccess(user, id, 'view')
  if (!doc) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Normalize null content (newly created / unset docs) to an empty doc so
  // serializeMarkdown and other exporters never receive null and throw.
  const content = doc.content ?? { type: 'doc', content: [] }
  const { body, contentType, ext } = await exportDoc(content, doc.title, format)
  const filename = exportFilename(doc.title, ext)

  // body is string | Uint8Array — both are valid BodyInit at runtime.
  // The DOM lib types Uint8Array without the Blob-compatible index signature so
  // we cast through BodyInit to satisfy the strict type checker.
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
