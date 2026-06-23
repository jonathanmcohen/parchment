// J6: GitHub PR / issue embed — reference parsing (PURE) + live status fetch.
//
// ANTI-SSRF AT THE SOURCE (the crux invariant). The ONLY URL this module ever
// fetches is `https://api.github.com/repos/<owner>/<repo>/issues/<number>` where
// owner/repo/number are values that parseGithubRef has ALREADY validated against
// a strict grammar. No user-supplied string ever reaches the fetch host:
//   - parseGithubRef accepts ONLY a github.com web URL whose host is EXACTLY
//     `github.com` (or `www.github.com`); every other host returns null. So a
//     `evil.com/x/y/pull/1`, a `github.com.evil.com/...`, a userinfo-`@` spoof,
//     a `javascript:`/`data:` scheme, or an `api.github.com`-spoof all parse to
//     null and never produce a ref.
//   - owner/repo match `^[A-Za-z0-9._-]+$`, number is `^[0-9]+$`. A ref that
//     passes therefore carries only chars that are safe to interpolate into a
//     URL path — no `/`, `:`, `?`, `#`, `@`, whitespace, or CRLF.
//   - githubApiUrl is hard-coded to the api.github.com host; it NEVER accepts or
//     interpolates a host from the input.
//
// SERVER-RUNTIME SAFE: this module imports nothing heavy and no editor / DOM /
// @db code, so it is safe to import from the schema path, the status route, and
// (the pure parts) the client NodeView. It reads process.env and uses global
// fetch only.
//
// TOKEN OPTIONAL (the E9 / isSemanticEnabled idiom): public-repo status works
// with NO config (subject to GitHub's anonymous rate limit). When GITHUB_TOKEN
// is set, fetchGithubStatus sends `Authorization: Bearer ${GITHUB_TOKEN}` which
// raises the rate limit and enables private repos. The token is SERVER-ONLY —
// it is never returned in any value this module produces, never sent to the
// client, and never logged.

/** A parsed reference to a GitHub PR or issue. */
export interface GithubRef {
  owner: string
  repo: string
  number: number
  kind: 'pr' | 'issue'
}

/** The live status of a GitHub PR or issue, as surfaced on the embed card. */
export interface GithubStatus {
  title: string
  /** open | closed for issues; open | closed | merged | draft for PRs. */
  state: 'open' | 'closed' | 'merged' | 'draft'
  author: string
  htmlUrl: string
  kind: 'pr' | 'issue'
}

// owner/repo: 1+ chars of [A-Za-z0-9._-]. This matches GitHub's own login/repo
// grammar closely enough while excluding `/`, `:`, `@`, `?`, `#`, whitespace,
// and control chars — so a validated value is always safe to interpolate into a
// URL path segment.
const OWNER_REPO_RE = /^[A-Za-z0-9._-]+$/
// number: pure digits (no sign, no whitespace).
const NUMBER_RE = /^[0-9]+$/
// The web path: /<owner>/<repo>/(pull|issues)/<number>, optionally with a
// trailing slash or extra path/query/hash that we ignore.
const PATH_RE = /^\/([^/]+)\/([^/]+)\/(pull|issues)\/([^/]+)/

/**
 * Parse a GitHub PR or issue *web* URL into a validated {owner, repo, number,
 * kind}, or null. STRICT — this is the anti-SSRF boundary:
 *   - the URL must parse and its host must be EXACTLY `github.com` (or the
 *     `www.github.com` alias). ANY other host — `evil.com`, `github.com.evil.com`,
 *     `api.github.com`, a userinfo-`@`-spoofed `github.com@evil.com`, an IP, a
 *     protocol-relative or `javascript:`/`data:` string — returns null.
 *   - the path must be `/<owner>/<repo>/(pull|issues)/<number>`.
 *   - owner/repo must match OWNER_REPO_RE; number must be all digits and > 0.
 * No other host is EVER accepted, so no user input can steer a later fetch to a
 * host other than the hard-coded api.github.com.
 */
export function parseGithubRef(url: unknown): GithubRef | null {
  if (typeof url !== 'string' || url.length === 0) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  // Only the https GitHub web origin. http: is rejected too (no downgrade).
  if (u.protocol !== 'https:') return null
  // URL.hostname excludes any userinfo/`@` and port, so an `@`-spoof like
  // `https://github.com@evil.com/...` has hostname `evil.com` and is rejected.
  const host = u.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') return null

  const m = PATH_RE.exec(u.pathname)
  if (!m) return null
  const owner = m[1] ?? ''
  const repo = m[2] ?? ''
  const kindRaw = m[3] ?? ''
  const numberRaw = m[4] ?? ''

  if (!OWNER_REPO_RE.test(owner)) return null
  if (!OWNER_REPO_RE.test(repo)) return null
  if (!NUMBER_RE.test(numberRaw)) return null
  const number = Number.parseInt(numberRaw, 10)
  if (!Number.isInteger(number) || number <= 0) return null

  return {
    owner,
    repo,
    number,
    kind: kindRaw === 'pull' ? 'pr' : 'issue',
  }
}

/**
 * The GitHub REST API URL for a parsed ref. ALWAYS
 * `https://api.github.com/repos/<owner>/<repo>/issues/<number>`.
 *
 * The issues endpoint serves BOTH PRs and issues for title/state/user (a PR is
 * an issue with a `pull_request` field), so a single endpoint covers both kinds.
 * The host is hard-coded — it is NEVER taken from input. The ref's parts are
 * already validated (parseGithubRef), so this interpolates only safe path chars;
 * we additionally encodeURIComponent the owner/repo defensively. number is a
 * validated positive integer.
 */
export function githubApiUrl(ref: GithubRef): string {
  const owner = encodeURIComponent(ref.owner)
  const repo = encodeURIComponent(ref.repo)
  return `https://api.github.com/repos/${owner}/${repo}/issues/${ref.number}`
}

/** True iff a GitHub token is configured (GITHUB_TOKEN set + non-empty). */
export function isGithubTokenSet(): boolean {
  return !!process.env.GITHUB_TOKEN
}

/**
 * The canonical github.com WEB URL for a ref (the human-facing PR/issue page).
 * ALWAYS on github.com with the validated owner/repo/number. PURE — used by the
 * client NodeView to (a) build the `?url=` it sends to the status route and
 * (b) render the always-present plain-link fallback. Never reaches the network.
 */
export function githubWebUrl(ref: GithubRef): string {
  const segment = ref.kind === 'pr' ? 'pull' : 'issues'
  return `https://github.com/${ref.owner}/${ref.repo}/${segment}/${ref.number}`
}

// The pulls endpoint for a ref — used best-effort to derive merged/draft for a
// PR. Same host/validation guarantees as githubApiUrl.
function githubPullUrl(ref: GithubRef): string {
  const owner = encodeURIComponent(ref.owner)
  const repo = encodeURIComponent(ref.repo)
  return `https://api.github.com/repos/${owner}/${repo}/pulls/${ref.number}`
}

// Build the request headers. Authorization is added ONLY when GITHUB_TOKEN is
// set — and the token never leaves this function (not returned, not logged).
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

// A short-timeout GET that NEVER throws — any network error / abort / non-2xx
// returns null. The caller treats null as "unavailable" (offline / rate-limited
// / not found) and degrades to the plain link.
async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: githubHeaders(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    const json = (await res.json()) as unknown
    if (typeof json !== 'object' || json === null) return null
    return json as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Fetch the live status of a PR / issue, or null when it cannot be determined
 * (network error, 404, rate-limit, bad shape, timeout). NEVER throws.
 *
 * The ONLY URL fetched is githubApiUrl(ref) (the issues endpoint, which serves
 * both PRs and issues). For a PR we additionally derive `merged`/`draft`:
 *   - `draft` from the issues payload's `draft` flag when present;
 *   - `merged` best-effort: from `pull_request.merged_at` on the issues payload
 *     when present, else from a follow-up pulls-endpoint fetch. The follow-up is
 *     itself resilient — if it fails we keep the issues-derived state (open/closed)
 *     rather than failing the whole card.
 *
 * Title/author are coerced to plain strings and length-capped. htmlUrl is the
 * GitHub-provided `html_url` only when it is a real github.com URL; otherwise we
 * fall back to deriving it from the validated ref (never trusting an arbitrary
 * host from the API response in the card link).
 */
export async function fetchGithubStatus(ref: GithubRef): Promise<GithubStatus | null> {
  const data = await fetchJson(githubApiUrl(ref))
  if (data === null) return null

  const title = typeof data.title === 'string' ? data.title.slice(0, 300) : ''
  const author = readLogin(data.user)
  const htmlUrl = safeHtmlUrl(data.html_url, ref)
  const isPr = ref.kind === 'pr' || typeof data.pull_request === 'object'
  const kind: 'pr' | 'issue' = isPr ? 'pr' : 'issue'

  const issueState = data.state === 'closed' ? 'closed' : 'open'

  if (!isPr) {
    return { title, state: issueState, author, htmlUrl, kind }
  }

  // PR: derive draft/merged best-effort.
  const draftFromIssue = data.draft === true
  const pr = isRecord(data.pull_request) ? data.pull_request : null
  const mergedFromIssue = typeof pr?.merged_at === 'string' && pr.merged_at.length > 0

  let state: GithubStatus['state']
  if (mergedFromIssue) {
    state = 'merged'
  } else if (issueState === 'open' && draftFromIssue) {
    state = 'draft'
  } else {
    // Fall back to the pulls endpoint to learn merged/draft when the issues
    // payload didn't carry it. Best-effort — a failure keeps the issue state.
    const pull = await fetchJson(githubPullUrl(ref))
    if (pull?.merged === true) {
      state = 'merged'
    } else if (issueState === 'open' && pull?.draft === true) {
      state = 'draft'
    } else {
      state = issueState
    }
  }

  return { title, state, author, htmlUrl, kind }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// Read the `login` from a GitHub user object, coerced + length-capped.
function readLogin(user: unknown): string {
  if (!isRecord(user)) return ''
  return typeof user.login === 'string' ? user.login.slice(0, 100) : ''
}

// Only surface an html_url that is a real github.com URL; otherwise derive the
// canonical web URL from the validated ref. This keeps the card's outbound link
// on github.com even if the API response is malformed/hostile.
function safeHtmlUrl(raw: unknown, ref: GithubRef): string {
  if (typeof raw === 'string') {
    try {
      const u = new URL(raw)
      if (u.protocol === 'https:') {
        const h = u.hostname.toLowerCase()
        if (h === 'github.com' || h === 'www.github.com') return raw
      }
    } catch {
      // fall through to the derived URL
    }
  }
  return githubWebUrl(ref)
}
