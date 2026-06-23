import 'server-only'
import type { Match } from '@/lib/integrations/dictionary'

// K7: LanguageTool grammar/style check — an OFF-BY-DEFAULT external service,
// mirrored on the compose.ts (G13) + cairn.ts (E9) idioms.
//
//   • Enabled IFF `LANGUAGETOOL_URL` is set. There is NO separate enable flag.
//     When unset: isLanguageToolEnabled() is false, checkGrammar() returns []
//     IMMEDIATELY with NO external call, and the /api/grammar/check route 404s
//     so the editor hides the grammar action.
//   • Server-proxied: the optional `LANGUAGETOOL_API_KEY` is read here (server)
//     and NEVER reaches the client — no CORS/key leak.
//   • Resilient: any network error, non-2xx, timeout, or bad shape yields []
//     (NEVER throws), so a flaky self-hosted LanguageTool can't break editing.
//
// SERVER-ONLY: imported by the grammar route only. Pulls in nothing heavy and
// no @/db / editor / DOM code; the only non-pure import is the shared Match type
// (a type-only import from the pure dictionary module).

/** Max characters sent to LanguageTool per check — bounds latency + payload. */
export const LANGUAGETOOL_INPUT_CAP = 20_000

/** Short request timeout (ms) — a slow LT instance must not hang the editor. */
const REQUEST_TIMEOUT_MS = 4000

/** Max replacement chips kept per match (LT can return dozens). */
const MAX_REPLACEMENTS = 8

/** True iff a LanguageTool endpoint is configured (LANGUAGETOOL_URL set). */
export function isLanguageToolEnabled(): boolean {
  return !!process.env.LANGUAGETOOL_URL
}

/** The configured LanguageTool base URL with any trailing slash removed, or null. */
function languageToolBase(): string | null {
  const raw = process.env.LANGUAGETOOL_URL
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/** A conservative BCP-47-ish locale grammar (e.g. `en-US`, `de`, `pt-BR`). */
const LOCALE_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,8})?$/

/** Coerce a caller-supplied locale to a safe value, defaulting to `en-US`. */
export function normalizeLocale(locale: unknown): string {
  if (typeof locale === 'string' && LOCALE_RE.test(locale)) return locale
  return 'en-US'
}

/** The raw shape of a LanguageTool `/v2/check` match (partial — only what we map). */
interface RawMatch {
  offset?: unknown
  length?: unknown
  message?: unknown
  replacements?: unknown
  rule?: { id?: unknown; category?: { id?: unknown; name?: unknown } } | null
}

/** Map one raw LanguageTool match to our `Match`, or null if it is unusable. */
function mapMatch(raw: RawMatch): Match | null {
  const offset = raw.offset
  const length = raw.length
  if (typeof offset !== 'number' || typeof length !== 'number') return null
  if (!Number.isFinite(offset) || !Number.isFinite(length)) return null
  if (offset < 0 || length <= 0) return null

  const message = typeof raw.message === 'string' ? raw.message.slice(0, 500) : ''

  const replacements: string[] = []
  if (Array.isArray(raw.replacements)) {
    for (const r of raw.replacements) {
      if (replacements.length >= MAX_REPLACEMENTS) break
      const value = (r as { value?: unknown })?.value
      if (typeof value === 'string' && value.length > 0) {
        replacements.push(value.slice(0, 200))
      }
    }
  }

  const ruleId = typeof raw.rule?.id === 'string' ? raw.rule.id : 'UNKNOWN'
  const category =
    typeof raw.rule?.category?.id === 'string'
      ? raw.rule.category.id
      : typeof raw.rule?.category?.name === 'string'
        ? raw.rule.category.name
        : 'UNKNOWN'

  return {
    offset,
    length,
    message,
    replacements,
    rule: { id: ruleId, category },
  }
}

/**
 * Run a grammar/style check against the configured LanguageTool instance.
 *
 * OFF BY DEFAULT — returns [] IMMEDIATELY (no fetch) when LANGUAGETOOL_URL is
 * unset or `text` is empty. When enabled: POSTs a form-encoded body
 * (`text` + `language`, plus `apiKey`/`username` if configured) to
 * `${LANGUAGETOOL_URL}/v2/check` with a short timeout. Input is capped to
 * LANGUAGETOOL_INPUT_CAP. Resilient — any error / non-2xx / bad shape / timeout
 * returns [] (NEVER throws). Matches are mapped to our `Match[]`; the dictionary
 * filter runs separately in the route. The API key never leaves the server.
 */
export async function checkGrammar(text: string, locale = 'en-US'): Promise<Match[]> {
  const base = languageToolBase()
  if (!base) return []
  if (typeof text !== 'string' || text.trim().length === 0) return []

  const capped = text.slice(0, LANGUAGETOOL_INPUT_CAP)
  const language = normalizeLocale(locale)

  const params = new URLSearchParams()
  params.set('text', capped)
  params.set('language', language)

  // Optional cloud / self-hosted premium credentials — read server-side ONLY.
  const apiKey = process.env.LANGUAGETOOL_API_KEY
  const username = process.env.LANGUAGETOOL_USERNAME
  if (apiKey) {
    params.set('apiKey', apiKey)
    if (username) params.set('username', username)
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${base}/v2/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return []

    const json = (await res.json()) as { matches?: unknown }
    if (!Array.isArray(json.matches)) return []

    const out: Match[] = []
    for (const raw of json.matches) {
      if (typeof raw !== 'object' || raw === null) continue
      const mapped = mapMatch(raw as RawMatch)
      if (mapped) out.push(mapped)
    }
    return out
  } catch {
    return []
  }
}
