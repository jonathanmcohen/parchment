import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { buildBulkZip } from '@/lib/export/bulk'
import { parseExportFormat } from '@/lib/export/index'

export const dynamic = 'force-dynamic'

/** Maximum number of doc ids accepted in a single bulk-export request. */
const MAX_IDS = 200

interface BulkExportBody {
  ids: unknown
  format: unknown
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as BulkExportBody

  // Validate ids: non-empty array of strings, capped at MAX_IDS
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    !body.ids.every((id) => typeof id === 'string')
  ) {
    return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
  }

  // Parse and validate format
  const format = parseExportFormat(body.format)
  if (!format) {
    return NextResponse.json(
      { error: 'format must be one of: md, txt, html, docx, epub, tex' },
      { status: 400 },
    )
  }

  // Cap the id count to prevent abuse
  const ids = (body.ids as string[]).slice(0, MAX_IDS)

  // Fetch each doc — silently skip non-owned or missing docs (never leak)
  const ownedDocs: { id: string; title: string; content: unknown }[] = []
  for (const id of ids) {
    const doc = await getDocument(id)
    if (!doc || doc.ownerId !== user.id) continue
    ownedDocs.push({ id: doc.id, title: doc.title, content: doc.content })
  }

  // Build the ZIP (empty zip if no owned docs resolve — friendlier than 404)
  const zipBytes = await buildBulkZip(ownedDocs, format)

  // zipBytes is Uint8Array — valid BodyInit at runtime; cast satisfies the strict type checker.
  return new Response(zipBytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="parchment-export.zip"',
    },
  })
}
