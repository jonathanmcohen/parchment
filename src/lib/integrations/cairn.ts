// J1: Cairn integration config + page-preview fetch. Cairn is the user's OTHER
// self-hosted app; a `[[cairn://<page-id>]]` link points at a page there.
//
// OFF-UNLESS-CONFIGURED (the E9 / Cairn CFG-2 pattern, mirrored from
// src/lib/search/embeddings.ts isSemanticEnabled): there is NO separate enable
// flag — the integration is enabled IFF `CAIRN_BASE_URL` is set. When it is
// unset, the link still works as a plain (non-navigable) link and NO external
// call is ever made: isCairnEnabled() is false, cairnPageUrl() returns null, and
// fetchCairnPagePreview() short-circuits to null BEFORE any fetch.
//
// SERVER-RUNTIME SAFE: this module imports nothing heavy and no editor/DOM/@db
// code, so it is safe to import from the schema path, server routes, and the
// client NodeView alike. It only reads process.env and uses global fetch.

/**
 * pageId validation. A Cairn page id is interpolated into a URL path
 * (cairnPageUrl, fetchCairnPagePreview) AND stored in the DB (cairn_links). We
 * accept ONLY a conservative slug/id grammar so a hostile id can never:
 *   - traverse paths (`../`, leading `/`) out of the page namespace,
 *   - inject a scheme/host (`javascript:`, `//evil.com`, `http://…`),
 *   - smuggle query/fragment/CRLF (`?`, `#`, `\r`, `\n`) into the request line,
 *   - blow up storage/URL length (overlong ids).
 *
 * Grammar: 1–128 chars of [A-Za-z0-9._-]. This covers Cairn's slug + uuid ids
 * while excluding `/`, `:`, whitespace, control chars, and URL metacharacters.
 * The dot is allowed for slugs like `my.page` but a value of only dots (`.`,
 * `..`) is rejected so a relative-path segment can never pass.
 */
const PAGE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/

/** True iff `pageId` is a safe Cairn page id (see PAGE_ID_RE). */
export function isValidCairnPageId(pageId: unknown): pageId is string {
  if (typeof pageId !== 'string') return false
  if (!PAGE_ID_RE.test(pageId)) return false
  // Reject pure-dot segments (`.`, `..`, `...`) — they pass the char class but
  // are path-traversal primitives. A real id always has a non-dot char.
  if (/^\.+$/.test(pageId)) return false
  return true
}

/**
 * Sanitize an arbitrary page id to the safe grammar, or return null when it
 * cannot be salvaged. Strips every char outside [A-Za-z0-9._-], truncates to
 * 128, then re-validates. Used wherever a pageId arrives from untrusted markdown
 * before it is stored or interpolated. A value that sanitizes to empty / pure
 * dots yields null (caller drops it).
 */
export function sanitizeCairnPageId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    // Drop every char outside the safe grammar (`/`, `:`, whitespace, control,
    // URL metacharacters) — this alone neutralizes traversal/injection.
    .replace(/[^A-Za-z0-9._-]/g, '')
    // Trim leading/trailing dots/dashes so a stripped `../../etc` salvages to the
    // intuitive `etc` rather than `....etc`, and a value that is ALL dots/dashes
    // collapses to '' (→ null below). Inner dots/dashes are preserved.
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 128)
  return isValidCairnPageId(cleaned) ? cleaned : null
}

/** True iff a Cairn endpoint is configured (CAIRN_BASE_URL set + non-empty). */
export function isCairnEnabled(): boolean {
  return !!process.env.CAIRN_BASE_URL
}

/** The configured Cairn base URL with any trailing slash removed, or null. */
function cairnBase(): string | null {
  const raw = process.env.CAIRN_BASE_URL
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/**
 * The human-facing URL of a Cairn page, or null when Cairn is not configured or
 * the pageId is invalid. NEVER builds a URL from an unvalidated id, so the
 * returned href can never carry traversal / scheme-injection. When this returns
 * null the link renders as a non-navigable span (no bad href).
 */
export function cairnPageUrl(pageId: string): string | null {
  const base = cairnBase()
  if (!base) return null
  if (!isValidCairnPageId(pageId)) return null
  return `${base}/p/${encodeURIComponent(pageId)}`
}

/** A Cairn page search result: a stable pageId + display title. */
export type CairnSearchResult = { id: string; title: string }

/**
 * Search Cairn pages for the `[[cairn://` autocomplete.
 *
 * OFF BY DEFAULT — returns [] IMMEDIATELY (no fetch) when CAIRN_BASE_URL is
 * unset. When enabled: a short-timeout GET to Cairn's page-search API; resilient
 * — any error / non-2xx / bad shape / timeout returns [] (NEVER throws). Each
 * result's id is sanitized (invalid ids dropped) so the suggestion list can
 * never offer a traversal/injection pageId; the title is coerced + length-capped.
 */
export async function searchCairnPages(query: string): Promise<CairnSearchResult[]> {
  const base = cairnBase()
  if (!base) return []

  const url = `${base}/api/pages/search?q=${encodeURIComponent(query)}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return []
    const json = (await res.json()) as unknown
    if (!Array.isArray(json)) return []
    const out: CairnSearchResult[] = []
    for (const row of json.slice(0, 10)) {
      if (typeof row !== 'object' || row === null) continue
      const r = row as { id?: unknown; title?: unknown }
      const id = sanitizeCairnPageId(r.id)
      if (id === null) continue
      const title = typeof r.title === 'string' ? r.title.slice(0, 200) : id
      out.push({ id, title })
    }
    return out
  } catch {
    return []
  }
}

/** A Cairn page preview: title + a short excerpt. */
export type CairnPagePreview = { title: string; excerpt: string }

/**
 * Fetch a Cairn page's preview metadata (title + excerpt) for the hover card.
 *
 * OFF BY DEFAULT — returns null IMMEDIATELY (no fetch) when CAIRN_BASE_URL is
 * unset or the pageId is invalid. When enabled: a short-timeout GET to Cairn's
 * page-meta API; resilient — any network error, non-2xx, bad shape, or timeout
 * returns null (NEVER throws). Title/excerpt are coerced to plain strings and
 * length-capped; rendering (CairnLinkView) is responsible for escaping (React
 * escapes by default — no dangerouslySetInnerHTML).
 */
export async function fetchCairnPagePreview(pageId: string): Promise<CairnPagePreview | null> {
  const base = cairnBase()
  if (!base) return null
  if (!isValidCairnPageId(pageId)) return null

  const url = `${base}/api/pages/${encodeURIComponent(pageId)}/meta`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    const json = (await res.json()) as { title?: unknown; excerpt?: unknown }
    const title = typeof json.title === 'string' ? json.title.slice(0, 200) : ''
    const excerpt = typeof json.excerpt === 'string' ? json.excerpt.slice(0, 500) : ''
    if (!title && !excerpt) return null
    return { title, excerpt }
  } catch {
    return null
  }
}
