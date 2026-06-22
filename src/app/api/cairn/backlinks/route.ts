import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { cairnBacklinks } from '@/lib/docs/cairn-links-repo'
import { isValidCairnPageId } from '@/lib/integrations/cairn'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cairn/backlinks?pageId=<cairn-page-id>
 * J1: the Parchment documents that link TO this Cairn page via
 * [[cairn://page-id]] links. This is the BIDIRECTIONAL endpoint Cairn polls to
 * build its own backlinks ("which Parchment docs reference this page?").
 * Returns [{ docId, title }], OWNER-SCOPED to the authenticated user. 401 when
 * unauthenticated, 400 when pageId is missing/invalid (never queries with an
 * unsafe value). NO external call — reads only the local cairn_links index.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const pageId = req.nextUrl.searchParams.get('pageId') ?? ''
  if (!isValidCairnPageId(pageId))
    return NextResponse.json({ error: 'invalid_page_id' }, { status: 400 })

  const rows = await cairnBacklinks(pageId, user.id)
  return NextResponse.json(rows)
}
