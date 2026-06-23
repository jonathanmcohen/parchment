import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { searchCairnPages } from '@/lib/integrations/cairn'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cairn/search?q=<query>
 * J1: page-search proxy for the `[[cairn://` autocomplete. Returns
 * [{ id, title }] of Cairn pages matching the query.
 *
 * OFF-UNLESS-CONFIGURED: searchCairnPages returns [] IMMEDIATELY (no external
 * call) when CAIRN_BASE_URL is unset, so when Cairn is not configured this
 * endpoint simply returns []. Owner-authenticated so an unauthenticated client
 * cannot use the server as a Cairn proxy.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const results = await searchCairnPages(q)
  return NextResponse.json(results)
}
