// G7a: CSL-JSON type subset + entry parser.
// Pure TS — no React, no db, no window. Import-safe everywhere (server + client + tsx).

export interface CslName {
  family?: string
  given?: string
  literal?: string
}

export interface CslDate {
  'date-parts'?: [number, number?, number?][]
  raw?: string
}

export type CslType =
  | 'article-journal'
  | 'book'
  | 'chapter'
  | 'paper-conference'
  | 'webpage'
  | 'report'
  | 'thesis'
  | 'article-magazine'
  | 'article-newspaper'

export interface CslEntry {
  id: string
  type: CslType
  title?: string
  author?: CslName[]
  editor?: CslName[]
  issued?: CslDate
  'container-title'?: string
  publisher?: string
  'publisher-place'?: string
  volume?: string
  issue?: string
  page?: string
  DOI?: string
  URL?: string
  accessed?: CslDate
}

export type CiteStyle = 'apa' | 'mla' | 'chicago'

const KNOWN_TYPES = new Set<string>([
  'article-journal',
  'book',
  'chapter',
  'paper-conference',
  'webpage',
  'report',
  'thesis',
  'article-magazine',
  'article-newspaper',
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function coerceName(v: unknown): CslName | null {
  if (!isRecord(v)) return null
  const name: CslName = {}
  if (typeof v.family === 'string') name.family = v.family
  if (typeof v.given === 'string') name.given = v.given
  if (typeof v.literal === 'string') name.literal = v.literal
  if (!name.family && !name.given && !name.literal) return null
  return name
}

function coerceDate(v: unknown): CslDate | null {
  if (!isRecord(v)) return null
  const d: CslDate = {}
  if (Array.isArray(v['date-parts'])) {
    const parts: [number, number?, number?][] = []
    for (const p of v['date-parts']) {
      if (Array.isArray(p) && typeof p[0] === 'number') {
        const year = p[0] as number
        const month = typeof p[1] === 'number' ? (p[1] as number) : undefined
        const day = typeof p[2] === 'number' ? (p[2] as number) : undefined
        parts.push(
          month !== undefined ? (day !== undefined ? [year, month, day] : [year, month]) : [year],
        )
      }
    }
    if (parts.length > 0) d['date-parts'] = parts
  }
  if (typeof v.raw === 'string') d.raw = v.raw
  if (!d['date-parts'] && !d.raw) return null
  return d
}

/** Validate/normalize an unknown value into a CslEntry[] (drop malformed entries; require id+type). */
export function parseCslEntries(raw: unknown): CslEntry[] {
  if (!Array.isArray(raw)) return []
  const result: CslEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.id !== 'string' || item.id.trim() === '') continue
    if (typeof item.type !== 'string' || !KNOWN_TYPES.has(item.type)) continue

    const entry: CslEntry = {
      id: item.id,
      type: item.type as CslType,
    }

    if (typeof item.title === 'string' && item.title.trim() !== '') entry.title = item.title
    if (typeof item.publisher === 'string') entry.publisher = item.publisher
    if (typeof item['publisher-place'] === 'string')
      entry['publisher-place'] = item['publisher-place']
    if (typeof item['container-title'] === 'string')
      entry['container-title'] = item['container-title']
    if (typeof item.volume === 'string') entry.volume = item.volume
    if (typeof item.issue === 'string') entry.issue = item.issue
    if (typeof item.page === 'string') entry.page = item.page
    if (typeof item.DOI === 'string') entry.DOI = item.DOI
    if (typeof item.URL === 'string') entry.URL = item.URL

    if (Array.isArray(item.author)) {
      const authors = item.author.map(coerceName).filter((n): n is CslName => n !== null)
      if (authors.length > 0) entry.author = authors
    }
    if (Array.isArray(item.editor)) {
      const editors = item.editor.map(coerceName).filter((n): n is CslName => n !== null)
      if (editors.length > 0) entry.editor = editors
    }

    const issued = coerceDate(item.issued)
    if (issued) entry.issued = issued
    const accessed = coerceDate(item.accessed)
    if (accessed) entry.accessed = accessed

    result.push(entry)
  }
  return result
}
