// G7a: CrossRef DOI lookup → CslEntry.
// Pure TS — no React, no db. Uses global fetch (available in Node 18+, Next.js edge/server, browser).
// USER-INITIATED ONLY — no automatic/background calls.

import type { CslEntry, CslName, CslType } from './types'

// ---------------------------------------------------------------------------
// CrossRef type → CSL type mapping
// ---------------------------------------------------------------------------
// CrossRef "type" string → CslType
const CROSSREF_TYPE_MAP: Record<string, CslType> = {
  'journal-article': 'article-journal',
  book: 'book',
  'book-chapter': 'chapter',
  'proceedings-article': 'paper-conference',
  'posted-content': 'report',
  dataset: 'report',
  report: 'report',
}

function mapCrossrefType(raw: unknown): CslType {
  if (typeof raw === 'string' && raw in CROSSREF_TYPE_MAP) {
    return CROSSREF_TYPE_MAP[raw] as CslType
  }
  return 'report'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return undefined
}

function mapAuthors(raw: unknown): CslName[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const names: CslName[] = []
  for (const a of raw) {
    if (!isRecord(a)) continue
    const name: CslName = {}
    if (typeof a.family === 'string') name.family = a.family
    if (typeof a.given === 'string') name.given = a.given
    if (typeof a.literal === 'string') name.literal = a.literal
    if (name.family || name.given || name.literal) names.push(name)
  }
  return names.length > 0 ? names : undefined
}

/**
 * Map a raw CrossRef 'message' object to a CslEntry (pure; exported for testing).
 * Returns null if no usable title + id (DOI).
 */
export function crossrefToCsl(message: unknown): CslEntry | null {
  if (!isRecord(message)) return null

  const doi = typeof message.DOI === 'string' ? message.DOI.trim() : ''
  if (!doi) return null

  const title = firstString(message.title)
  if (!title) return null

  const entry: CslEntry = {
    id: doi,
    type: mapCrossrefType(message.type),
    title,
    DOI: doi,
  }

  const author = mapAuthors(message.author)
  if (author) entry.author = author

  // issued date-parts
  const issuedRaw = message.issued
  if (isRecord(issuedRaw) && Array.isArray(issuedRaw['date-parts'])) {
    const dp = issuedRaw['date-parts']
    const parts: [number, number?, number?][] = []
    for (const p of dp) {
      if (Array.isArray(p) && typeof p[0] === 'number') {
        const year = p[0] as number
        const month = typeof p[1] === 'number' ? (p[1] as number) : undefined
        const day = typeof p[2] === 'number' ? (p[2] as number) : undefined
        parts.push(
          month !== undefined ? (day !== undefined ? [year, month, day] : [year, month]) : [year],
        )
      }
    }
    if (parts.length > 0) entry.issued = { 'date-parts': parts }
  }

  const containerTitle = firstString(message['container-title'])
  if (containerTitle) entry['container-title'] = containerTitle

  if (typeof message.publisher === 'string') entry.publisher = message.publisher
  if (typeof message.volume === 'string') entry.volume = message.volume
  if (typeof message.issue === 'string') entry.issue = message.issue
  if (typeof message.page === 'string') entry.page = message.page
  if (typeof message.URL === 'string') entry.URL = message.URL

  return entry
}

/**
 * Look up a DOI via the public CrossRef REST API.
 * Returns null on any error / non-200 / unparseable.
 * Never throws.
 * Sets a polite User-Agent per CrossRef etiquette.
 */
export async function fetchDoiCsl(doi: string): Promise<CslEntry | null> {
  try {
    // Strip a leading https://doi.org/ prefix if present
    const normalized = doi.trim().replace(/^https?:\/\/doi\.org\//i, '')
    if (!normalized) return null

    const url = `https://api.crossref.org/works/${encodeURIComponent(normalized)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Parchment/0.1 (citations)',
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null

    const json: unknown = await res.json()
    if (!isRecord(json)) return null

    return crossrefToCsl(json.message)
  } catch {
    return null
  }
}
