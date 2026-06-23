import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import {
  fetchGithubStatus,
  type GithubStatus,
  githubApiUrl,
  parseGithubRef,
} from '@/lib/integrations/github'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/status?url=<github-pr-or-issue-url>
 * J6: the live status-card data for a GitHub PR / issue, used by the client
 * GithubEmbedView. The flow is strictly:
 *   1. authenticate (owner / PAT) — 401 otherwise.
 *   2. parseGithubRef(url) — the anti-SSRF boundary. 400 on any URL that is not
 *      a github.com PR/issue web URL (wrong host, bad owner/repo, etc.). NOTHING
 *      is fetched for an invalid url.
 *   3. fetchGithubStatus(ref) — fetches ONLY api.github.com (the validated ref),
 *      resilient to network/404/rate-limit (returns null). On null we return a
 *      graceful { unavailable:true } body so the card degrades to the plain link.
 *
 * SHORT IN-MEMORY CACHE (60s) keyed by the api.github.com URL of the validated
 * ref — so re-rendering a doc with many GitHub cards does not hammer GitHub on
 * every paint. The cache key is the validated api URL (never raw user input),
 * and it stores ONLY the public card JSON (never the token). The cache is
 * process-local and best-effort; force-dynamic keeps the route per-request.
 *
 * GITHUB_TOKEN is read server-side inside fetchGithubStatus ONLY and never
 * appears in any response body.
 */

type CacheEntry = { at: number; status: GithubStatus | null }
const CACHE_TTL_MS = 60_000
const MAX_CACHE_ENTRIES = 500
// Module-scope cache: survives across requests in a warm server process.
const cache = new Map<string, CacheEntry>()

function getCached(key: string): CacheEntry | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return hit
}

function setCached(key: string, status: GithubStatus | null): void {
  // Bound the cache: drop the oldest entry when full (Map preserves insertion
  // order, so the first key is the oldest).
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), status })
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url') ?? ''
  const ref = parseGithubRef(url)
  // Anti-SSRF: a url the parser rejects is NEVER fetched. 400, no outbound call.
  if (ref === null) return NextResponse.json({ error: 'invalid_url' }, { status: 400 })

  // Cache key is the validated api.github.com URL — derived from the ref, never
  // from raw input. The token (if any) does not vary the public card data.
  const cacheKey = githubApiUrl(ref)
  const cached = getCached(cacheKey)
  const status = cached ? cached.status : await fetchGithubStatus(ref)
  if (!cached) setCached(cacheKey, status)

  // Graceful unavailable: fetch failed / rate-limited / 404 → degrade to a link.
  if (status === null) {
    return NextResponse.json({ unavailable: true, kind: ref.kind })
  }

  // The card JSON. NEVER includes the token; title/author are GitHub-provided
  // plain text that the client renders as TEXT (React escapes).
  return NextResponse.json({
    title: status.title,
    state: status.state,
    author: status.author,
    htmlUrl: status.htmlUrl,
    kind: status.kind,
  })
}
