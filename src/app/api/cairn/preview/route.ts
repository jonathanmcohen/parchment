import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { cairnPageUrl, fetchCairnPagePreview, isValidCairnPageId } from '@/lib/integrations/cairn'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cairn/preview?pageId=<cairn-page-id>
 * J1: the preview-card data for a Cairn page, used by the client CairnLinkView
 * hover card. Returns { url, title, excerpt } where:
 *   - url     — the human Cairn page URL, or null when CAIRN_BASE_URL is unset
 *               (the link is then non-navigable). Always validated (cairnPageUrl).
 *   - title   — the Cairn page title (may be '' when unavailable).
 *   - excerpt — a short excerpt (may be '' when unavailable).
 *
 * The fetch happens SERVER-SIDE (the client cannot read CAIRN_BASE_URL) and is
 * OFF-UNLESS-CONFIGURED: fetchCairnPagePreview returns null IMMEDIATELY (no
 * external call) when CAIRN_BASE_URL is unset. When Cairn is unset the body is
 * still returned but with url:null and empty title/excerpt — the card renders
 * just the (non-navigable) link, NO external call was made. Owner-authenticated;
 * 400 on an invalid pageId (never fetched).
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const pageId = req.nextUrl.searchParams.get('pageId') ?? ''
  if (!isValidCairnPageId(pageId))
    return NextResponse.json({ error: 'invalid_page_id' }, { status: 400 })

  // cairnPageUrl is a pure env read (no external call). fetchCairnPagePreview is
  // the only outbound call and is itself off-by-default.
  const url = cairnPageUrl(pageId)
  const preview = await fetchCairnPagePreview(pageId)
  return NextResponse.json({
    url,
    title: preview?.title ?? '',
    excerpt: preview?.excerpt ?? '',
  })
}
