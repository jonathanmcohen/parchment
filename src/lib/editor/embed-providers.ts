/**
 * J2 + J3 — Embed provider allowlist (PURE: no React / DOM / db).
 *
 * THE CRUX INVARIANT: an iframe `src` is ALWAYS an allowlisted https provider
 * URL, or there is NO iframe. The embed NodeView (EmbedView.tsx) renders an
 * iframe ONLY when `resolveProvider(url)` returns a non-null result; otherwise
 * it renders a click-to-open link card (never an iframe). This module is the
 * single chokepoint that decides whether a user-supplied URL is allowed to
 * become an iframe src, and what that src is.
 *
 * SECURITY MODEL — defense in depth, deny by default:
 *   1. parseHttpsUrl() rejects anything that is not a well-formed absolute
 *      `https:` URL. javascript:, data:, http:, mailto:, protocol-relative
 *      (`//host`), and unparseable strings all return null up front. No
 *      provider ever sees a non-https URL.
 *   2. Each provider's `test(url)` matches ONLY on an EXACT hostname (or a
 *      hostname that ends with `.<allowlisted-host>`, i.e. a true subdomain) —
 *      never a substring. `calendar.google.com.evil.example` and
 *      `notairtable.com` are rejected. The host check is done against the parsed
 *      URL.hostname, so userinfo/`@`-tricks (`https://calendar.google.com@evil`)
 *      cannot smuggle an attacker host past the check.
 *   3. `toEmbedUrl(url)` NEVER reflects arbitrary input into the iframe src. It
 *      re-derives the src by constructing a fresh URL on the provider's OWN
 *      allowlisted host from extracted, validated path/id components — never by
 *      passing the raw input through. The returned URL is therefore always
 *      `https://<allowlisted-host>/…`. If derivation cannot be done safely it
 *      returns null (→ link-card fallback).
 *
 * The unit suite (tests/unit/embed-providers.test.ts) asserts every branch of
 * this contract, including that toEmbedUrl never yields a non-allowlisted host
 * for any input, adversarial or not.
 */

export type EmbedKind = 'calendar' | 'spreadsheet'

export interface EmbedProvider {
  /** Stable id stored in the node attr + the parchment:embed fence. */
  id: string
  /** Human label for the dialog / NodeView caption. */
  label: string
  kind: EmbedKind
  /** True when this provider recognises the URL as one it can embed. */
  test(url: string): boolean
  /**
   * Derive the sandboxed-iframe src for `url`, or null when it cannot be turned
   * into a safe allowlisted https embed. The result is ALWAYS an `https://` URL
   * on this provider's own allowlisted host — never the raw input.
   */
  toEmbedUrl(url: string): string | null
}

/**
 * The set of hosts the embed iframe is EVER allowed to load. Every provider's
 * toEmbedUrl output is constructed on one of these hosts; the NodeView could
 * additionally assert membership as a belt-and-suspenders check.
 */
export const ALLOWLISTED_EMBED_HOSTS: readonly string[] = [
  'calendar.google.com',
  'docs.google.com',
  'airtable.com',
  'onedrive.live.com',
  'view.officeapps.live.com',
]

/**
 * Parse `url` as an absolute `https:` URL. Returns the URL object only when it
 * is well-formed AND https. Everything else (javascript:, data:, http:, mailto:,
 * protocol-relative `//host`, garbage) returns null. This is the first gate:
 * no provider's test/toEmbedUrl ever sees a non-https URL.
 */
function parseHttpsUrl(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  return u
}

/**
 * True when `host` is EXACTLY `allowed` or a true subdomain of it
 * (`<sub>.<allowed>`). Substring matches (`notairtable.com`,
 * `calendar.google.com.evil.example`) are rejected. Comparison is
 * case-insensitive (URL.hostname is already lowercased by the URL parser, but we
 * normalise defensively).
 */
function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase()
  const a = allowed.toLowerCase()
  return h === a || h.endsWith(`.${a}`)
}

// ── Google Calendar (J2) ─────────────────────────────────────────────────────
//
// Public Google Calendar embed URLs look like:
//   https://calendar.google.com/calendar/embed?src=<calId>&ctz=<tz>...
// We re-derive a fresh embed URL on calendar.google.com, preserving ONLY the
// known-safe query params (src, ctz, mode, etc.) by re-attaching the original
// search verbatim to a fresh /calendar/embed path on the allowlisted host. The
// host is fixed by construction, so even a crafted src= cannot move the iframe
// off calendar.google.com.

const GOOGLE_CALENDAR: EmbedProvider = {
  id: 'google-calendar',
  label: 'Google Calendar',
  kind: 'calendar',
  test(url) {
    const u = parseHttpsUrl(url)
    if (!u) return false
    return hostMatches(u.hostname, 'calendar.google.com') && u.pathname.startsWith('/calendar/')
  },
  toEmbedUrl(url) {
    const u = parseHttpsUrl(url)
    if (!u) return null
    if (!hostMatches(u.hostname, 'calendar.google.com')) return null
    if (!u.pathname.startsWith('/calendar/')) return null
    // Build a fresh URL on the fixed allowlisted host. Carry the original query
    // (src/ctz/mode/…) but the host + path are pinned by construction.
    const out = new URL('https://calendar.google.com/calendar/embed')
    out.search = u.search
    return out.toString()
  },
}

// ── Google Sheets (J3) ───────────────────────────────────────────────────────
//
// Accepts:
//   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
//   https://docs.google.com/spreadsheets/d/<ID>/pubhtml
//   https://docs.google.com/spreadsheets/d/e/<PUB_ID>/pubhtml
// Always derives an embed src on docs.google.com using the extracted document
// id and the /pubhtml?widget=true&headers=false embed form (the supported
// read-only embed shape). The ID is extracted with a strict charset regex so no
// arbitrary path can be reflected.

const SHEETS_ID_RE = /^\/spreadsheets\/d\/(e\/)?([A-Za-z0-9_-]+)/

const GOOGLE_SHEETS: EmbedProvider = {
  id: 'google-sheets',
  label: 'Google Sheets',
  kind: 'spreadsheet',
  test(url) {
    const u = parseHttpsUrl(url)
    if (!u) return false
    return hostMatches(u.hostname, 'docs.google.com') && SHEETS_ID_RE.test(u.pathname)
  },
  toEmbedUrl(url) {
    const u = parseHttpsUrl(url)
    if (!u) return null
    if (!hostMatches(u.hostname, 'docs.google.com')) return null
    const m = SHEETS_ID_RE.exec(u.pathname)
    if (!m) return null
    const isPublished = m[1] === 'e/'
    const id = m[2] ?? ''
    if (!id) return null
    // Re-derive a read-only embed src on the fixed host. The /pubhtml widget form
    // renders a read-only grid without external script in the host page.
    const path = isPublished ? `/spreadsheets/d/e/${id}/pubhtml` : `/spreadsheets/d/${id}/pubhtml`
    const out = new URL(`https://docs.google.com${path}`)
    out.searchParams.set('widget', 'true')
    out.searchParams.set('headers', 'false')
    return out.toString()
  },
}

// ── Airtable (J3) ────────────────────────────────────────────────────────────
//
// Accepts a share link (https://airtable.com/shr…) or an already-embed link
// (https://airtable.com/embed/shr…). Always derives airtable.com/embed/<shareId>.
// The share id is extracted with a strict charset regex.

const AIRTABLE_SHARE_RE = /^\/(?:embed\/)?(shr[A-Za-z0-9]+)/

const AIRTABLE: EmbedProvider = {
  id: 'airtable',
  label: 'Airtable',
  kind: 'spreadsheet',
  test(url) {
    const u = parseHttpsUrl(url)
    if (!u) return false
    return hostMatches(u.hostname, 'airtable.com') && AIRTABLE_SHARE_RE.test(u.pathname)
  },
  toEmbedUrl(url) {
    const u = parseHttpsUrl(url)
    if (!u) return null
    if (!hostMatches(u.hostname, 'airtable.com')) return null
    const m = AIRTABLE_SHARE_RE.exec(u.pathname)
    if (!m) return null
    const shareId = m[1] ?? ''
    if (!shareId) return null
    return `https://airtable.com/embed/${shareId}`
  },
}

// ── Office / OneDrive (J3) ───────────────────────────────────────────────────
//
// Accepts a OneDrive share/embed link (https://onedrive.live.com/embed?…) or an
// Office web-apps viewer link (https://view.officeapps.live.com/op/embed.aspx?…).
// The host is fixed by construction; the original query (cid/resid/authkey/src)
// is carried but cannot move the iframe off the allowlisted host.

const OFFICE: EmbedProvider = {
  id: 'office',
  label: 'Office / OneDrive',
  kind: 'spreadsheet',
  test(url) {
    const u = parseHttpsUrl(url)
    if (!u) return false
    return (
      hostMatches(u.hostname, 'onedrive.live.com') ||
      hostMatches(u.hostname, 'view.officeapps.live.com')
    )
  },
  toEmbedUrl(url) {
    const u = parseHttpsUrl(url)
    if (!u) return null
    if (hostMatches(u.hostname, 'onedrive.live.com')) {
      const out = new URL('https://onedrive.live.com/embed')
      out.search = u.search
      return out.toString()
    }
    if (hostMatches(u.hostname, 'view.officeapps.live.com')) {
      const out = new URL('https://view.officeapps.live.com/op/embed.aspx')
      out.search = u.search
      return out.toString()
    }
    return null
  },
}

/**
 * The built-in allowlist. Order matters only for resolveProvider's first-match
 * (each provider's test() is mutually exclusive on host, so order is not
 * load-bearing — but a deterministic order keeps behaviour stable).
 */
export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  GOOGLE_CALENDAR,
  GOOGLE_SHEETS,
  AIRTABLE,
  OFFICE,
]

/** Look up a provider by its stored id (for the NodeView caption / dialog). */
export function providerById(id: string): EmbedProvider | undefined {
  return EMBED_PROVIDERS.find((p) => p.id === id)
}

export interface ResolvedEmbed {
  provider: EmbedProvider
  /** The sandboxed-iframe src — ALWAYS an allowlisted https provider URL. */
  embedUrl: string
}

/**
 * Resolve a user-supplied URL to a provider + an allowlisted https embed src,
 * or null when the URL is not embeddable. Returning null is the signal to the
 * NodeView to render a link-card fallback (NEVER an iframe).
 *
 * A provider is only accepted when BOTH test() passes AND toEmbedUrl() yields a
 * non-null https URL on one of ALLOWLISTED_EMBED_HOSTS — the final belt-and-
 * suspenders gate that makes it impossible for a non-allowlisted host to ever
 * reach the iframe src.
 */
export function resolveProvider(url: string): ResolvedEmbed | null {
  for (const provider of EMBED_PROVIDERS) {
    if (!provider.test(url)) continue
    const embedUrl = provider.toEmbedUrl(url)
    if (embedUrl === null) continue
    // Final gate: the derived src must be https on an allowlisted host. This can
    // only fail if a provider is buggy; the check guarantees the crux invariant
    // holds regardless of provider implementation.
    let parsed: URL
    try {
      parsed = new URL(embedUrl)
    } catch {
      continue
    }
    if (parsed.protocol !== 'https:') continue
    if (!ALLOWLISTED_EMBED_HOSTS.some((h) => hostMatches(parsed.hostname, h))) continue
    return { provider, embedUrl }
  }
  return null
}
