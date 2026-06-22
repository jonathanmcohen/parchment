// G7a: Citation formatter — APA 7th, MLA 9th, Chicago 17th (author-date).
// Pure TS — no React, no db, no window. Import-safe everywhere (server + client + tsx).
//
// v0.1 scope: deterministic plain-text output. Title italics are NOT marked up
// in this version — the editor NodeView can style by field position later.
// Full citeproc fidelity is NOT a goal; APA/MLA/Chicago must be visibly distinct
// and correct on author/title/year ordering and punctuation.

import type { CiteStyle, CslEntry, CslName } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the year string from a CslDate, falling back to "n.d." */
function getYear(entry: CslEntry): string {
  const dp = entry.issued?.['date-parts']
  if (dp && dp.length > 0) {
    const first = dp[0]
    if (first && typeof first[0] === 'number') return String(first[0])
  }
  if (entry.issued?.raw) return entry.issued.raw
  return 'n.d.'
}

/** Render a single name as "Family, Given" (APA bibliography) or "Family, Given" (MLA first author). */
function nameToString(name: CslName): string {
  if (name.literal) return name.literal
  const family = name.family ?? ''
  const given = name.given ?? ''
  if (family && given) return `${family}, ${given}`
  return family || given
}

/** Render a name as "Given Family" (non-first authors in MLA/Chicago). */
function nameGivenFirst(name: CslName): string {
  if (name.literal) return name.literal
  const family = name.family ?? ''
  const given = name.given ?? ''
  if (family && given) return `${given} ${family}`
  return family || given
}

/** The family name only (for in-text citations). */
function familyName(name: CslName): string {
  if (name.literal) return name.literal
  return name.family ?? name.given ?? ''
}

// ---------------------------------------------------------------------------
// Author string builders
// ---------------------------------------------------------------------------

/**
 * In-text author fragment.
 * APA 7:  1 → "Smith"; 2 → "Smith & Jones"; 3+ → "Smith et al."
 * MLA 9:  1 → "Smith"; 2 → "Smith and Jones"; 3+ → "Smith et al."
 * Chicago:1 → "Smith"; 2 → "Smith and Jones"; 3+ → "Smith et al."
 */
function inTextAuthors(entry: CslEntry, style: CiteStyle): string {
  const authors = entry.author
  if (!authors || authors.length === 0) return ''
  const a0 = authors[0]
  if (!a0) return ''
  const first = familyName(a0)
  if (authors.length === 1) return first
  if (authors.length === 2) {
    const a1 = authors[1]
    const second = a1 ? familyName(a1) : ''
    const sep = style === 'apa' ? ' & ' : ' and '
    return `${first}${sep}${second}`
  }
  return `${first} et al.`
}

/**
 * Bibliography author list — all authors.
 * APA 7:  "Smith, J., & Jones, K." — first author inverted, ampersand before last.
 * MLA 9:  "Smith, John, and Karen Jones." — first inverted, rest given-first, period.
 * Chicago:"Smith, John, and Karen Jones." — same as MLA for bibliography.
 */
function bibAuthors(authors: CslName[], style: CiteStyle): string {
  if (authors.length === 0) return ''

  if (style === 'apa') {
    // First author inverted, initials implied (we keep full given as-is for v0.1)
    const parts = authors.map((a, i) => {
      const inv = nameToString(a) // "Family, Given"
      return i === authors.length - 1 && authors.length > 1 ? `& ${inv}` : inv
    })
    return parts.join(', ')
  }

  // MLA / Chicago: "Family, Given" for first; "Given Family" for rest; joined with ", and " before last
  const bib0 = authors[0]
  if (!bib0) return ''
  if (authors.length === 1) {
    return nameToString(bib0)
  }
  const bib1 = authors[1]
  if (authors.length === 2) {
    return `${nameToString(bib0)}, and ${bib1 ? nameGivenFirst(bib1) : ''}`
  }
  // 3+
  const first = nameToString(bib0)
  const rest = authors.slice(1, -1).map(nameGivenFirst)
  const lastAuthor = authors[authors.length - 1]
  const last = lastAuthor ? nameGivenFirst(lastAuthor) : ''
  return [first, ...rest, `and ${last}`].join(', ')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Author-date in-text citation.
 * APA:     (Smith & Jones, 2020) or (Smith & Jones, 2020, p. 42)
 * MLA:     (Smith 42) with page or (Smith) without — author-page, no year
 * Chicago: (Smith and Jones 2020) or (Smith and Jones 2020, 42)
 */
export function formatInText(entry: CslEntry, style: CiteStyle, opts?: { page?: string }): string {
  const page = opts?.page
  const authors = inTextAuthors(entry, style)
  const label = authors || entry.title?.slice(0, 20) || entry.id

  if (style === 'apa') {
    const year = getYear(entry)
    if (page) return `(${label}, ${year}, p. ${page})`
    return `(${label}, ${year})`
  }

  if (style === 'mla') {
    if (page) return `(${label} ${page})`
    return `(${label})`
  }

  // Chicago author-date
  const year = getYear(entry)
  if (page) return `(${label} ${year}, ${page})`
  return `(${label} ${year})`
}

/**
 * Full bibliography reference line (plain text).
 * Handles: article-journal, book, chapter, webpage (all other types fallback to book-like).
 */
export function formatBibliographyEntry(entry: CslEntry, style: CiteStyle): string {
  const year = getYear(entry)
  const authors = entry.author ?? []
  const authorStr = bibAuthors(authors, style)

  if (style === 'apa') {
    return formatApa(entry, authorStr, year)
  }
  if (style === 'mla') {
    return formatMla(entry, authorStr)
  }
  return formatChicago(entry, authorStr, year)
}

// ---------------------------------------------------------------------------
// APA 7th
// ---------------------------------------------------------------------------
// General pattern: Author, A. A. (Year). Title. Source. https://doi.org/DOI
// article-journal: Author. (Year). Title. Container, vol(issue), pages. https://doi.org/DOI
// book:            Author. (Year). Title. Publisher.
// chapter:         Author. (Year). Title. In Container (pp. pages). Publisher.
// webpage:         Author. (Year). Title. URL

function formatApa(entry: CslEntry, authorStr: string, year: string): string {
  const title = entry.title ?? ''
  const parts: string[] = []

  if (authorStr) parts.push(`${authorStr}.`)
  parts.push(`(${year}).`)

  if (
    entry.type === 'article-journal' ||
    entry.type === 'article-magazine' ||
    entry.type === 'article-newspaper'
  ) {
    parts.push(`${title}.`)
    const sourceParts: string[] = []
    if (entry['container-title']) sourceParts.push(entry['container-title'])
    if (entry.volume) {
      const volStr = entry.issue ? `${entry.volume}(${entry.issue})` : entry.volume
      sourceParts.push(volStr)
    } else if (entry.issue) {
      sourceParts.push(`(${entry.issue})`)
    }
    if (entry.page) sourceParts.push(entry.page)
    const source = sourceParts.join(', ')
    if (source) parts.push(`${source}.`)
    if (entry.DOI) parts.push(`https://doi.org/${entry.DOI}`)
    else if (entry.URL) parts.push(entry.URL)
  } else if (entry.type === 'chapter') {
    parts.push(`${title}.`)
    // APA 7 §10.3: In E. Editor (Ed.), Container (pp. X–Y). Publisher.
    // Only emit the In-clause when it has meaningful content.
    const hasInContent = !!(entry.editor?.length || entry['container-title'] || entry.page)
    if (hasInContent) {
      let inPart = 'In'
      if (entry.editor && entry.editor.length > 0) {
        const edList = entry.editor.map((ed) => {
          // APA editor format: initials+family, e.g. "K. Jones"
          const givenInitials = ed.given
            ? ed.given
                .split(/\s+/)
                .map((g) => `${g[0] ?? ''}.`)
                .join(' ')
            : ''
          if (ed.literal) return ed.literal
          const fam = ed.family ?? ''
          return givenInitials ? `${givenInitials} ${fam}` : fam
        })
        const suffix = entry.editor.length === 1 ? '(Ed.)' : '(Eds.)'
        inPart += ` ${edList.join(', ')} ${suffix},`
      }
      if (entry['container-title']) inPart += ` ${entry['container-title']}`
      if (entry.page) inPart += ` (pp. ${entry.page})`
      parts.push(`${inPart}.`)
    }
    if (entry.publisher) parts.push(`${entry.publisher}.`)
  } else if (entry.type === 'webpage') {
    parts.push(`${title}.`)
    if (entry.URL) parts.push(entry.URL)
  } else {
    // book, report, thesis, paper-conference, etc.
    parts.push(`${title}.`)
    if (entry.publisher) parts.push(`${entry.publisher}.`)
    if (entry.DOI) parts.push(`https://doi.org/${entry.DOI}`)
    else if (entry.URL) parts.push(entry.URL)
  }

  return parts.join(' ').trim()
}

// ---------------------------------------------------------------------------
// MLA 9th
// ---------------------------------------------------------------------------
// General pattern: Author. "Title." Container, vol. X, no. Y, Year, pp. pages.
// article-journal: Author. "Title." Container, vol. X, no. Y, Year, pp. pages, DOI/URL.
// book:            Author. Title. Publisher, Year.
// chapter:         Author. "Title." Container, edited by Editor, Publisher, Year, pp. pages.
// webpage:         Author. "Title." Website, Date, URL.

function formatMla(entry: CslEntry, authorStr: string): string {
  const year = getYear(entry)
  const title = entry.title ?? ''
  const parts: string[] = []

  if (authorStr) parts.push(`${authorStr}.`)

  if (
    entry.type === 'article-journal' ||
    entry.type === 'article-magazine' ||
    entry.type === 'article-newspaper'
  ) {
    parts.push(`"${title}."`)
    const mlaSrcParts: string[] = []
    if (entry['container-title']) mlaSrcParts.push(entry['container-title'])
    if (entry.volume) mlaSrcParts.push(`vol. ${entry.volume}`)
    if (entry.issue) mlaSrcParts.push(`no. ${entry.issue}`)
    if (year !== 'n.d.') mlaSrcParts.push(year)
    if (entry.page) mlaSrcParts.push(`pp. ${entry.page}`)
    const mlaSrc = mlaSrcParts.join(', ')
    if (mlaSrc) parts.push(`${mlaSrc}.`)
    if (entry.DOI) parts.push(`https://doi.org/${entry.DOI}`)
    else if (entry.URL) parts.push(entry.URL)
  } else if (entry.type === 'chapter') {
    parts.push(`"${title}."`)
    const mlaChSrcParts: string[] = []
    if (entry['container-title']) mlaChSrcParts.push(entry['container-title'])
    if (entry.editor && entry.editor.length > 0) {
      mlaChSrcParts.push(`edited by ${entry.editor.map(nameGivenFirst).join(', ')}`)
    }
    if (entry.publisher) mlaChSrcParts.push(entry.publisher)
    if (year !== 'n.d.') mlaChSrcParts.push(year)
    if (entry.page) mlaChSrcParts.push(`pp. ${entry.page}`)
    const mlaChSrc = mlaChSrcParts.join(', ')
    if (mlaChSrc) parts.push(`${mlaChSrc}.`)
  } else if (entry.type === 'webpage') {
    parts.push(`"${title}."`)
    if (entry['container-title']) parts.push(`${entry['container-title']},`)
    if (year !== 'n.d.') parts.push(`${year},`)
    if (entry.URL) parts.push(entry.URL)
  } else {
    // book, report, thesis, paper-conference
    parts.push(`${title}.`)
    if (entry.publisher) {
      // Use a comma separator only when a year will follow; otherwise close with a period.
      parts.push(year !== 'n.d.' ? `${entry.publisher},` : `${entry.publisher}.`)
    }
    if (year !== 'n.d.') parts.push(`${year}.`)
  }

  return parts.join(' ').trim()
}

// ---------------------------------------------------------------------------
// Chicago 17th (author-date)
// ---------------------------------------------------------------------------
// General pattern: Author. Year. Title. Place: Publisher.
// article-journal: Author. Year. "Title." Container vol, no. issue: pages. https://doi.org/DOI
// book:            Author. Year. Title. Place: Publisher.
// chapter:         Author. Year. "Title." In Container, edited by Editor, pages. Place: Publisher.
// webpage:         Author. Year. "Title." URL.

function formatChicago(entry: CslEntry, authorStr: string, year: string): string {
  const title = entry.title ?? ''
  const parts: string[] = []

  if (authorStr) parts.push(`${authorStr}.`)
  // n.d. already ends with a period — avoid 'n.d..' in the output.
  parts.push(year === 'n.d.' ? year : `${year}.`)

  if (
    entry.type === 'article-journal' ||
    entry.type === 'article-magazine' ||
    entry.type === 'article-newspaper'
  ) {
    parts.push(`"${title}."`)
    // Chicago: Container vol (issue): page — build from parts to avoid leading separator
    const chiSrcTokens: string[] = []
    if (entry['container-title']) chiSrcTokens.push(entry['container-title'])
    let chiVolIssue = ''
    if (entry.volume) {
      chiVolIssue = entry.volume
      if (entry.issue) chiVolIssue += ` (${entry.issue})`
    } else if (entry.issue) {
      chiVolIssue = `(${entry.issue})`
    }
    if (chiVolIssue) chiSrcTokens.push(chiVolIssue)
    const chiBaseSrc = chiSrcTokens.join(' ')
    const chiSrc = entry.page ? `${chiBaseSrc}: ${entry.page}` : chiBaseSrc
    if (chiSrc) parts.push(`${chiSrc}.`)
    if (entry.DOI) parts.push(`https://doi.org/${entry.DOI}`)
    else if (entry.URL) parts.push(entry.URL)
  } else if (entry.type === 'chapter') {
    parts.push(`"${title}."`)
    let inPart = `In ${entry['container-title'] ?? ''}`
    if (entry.editor && entry.editor.length > 0) {
      inPart += `, edited by ${entry.editor.map(nameGivenFirst).join(', ')}`
    }
    if (entry.page) inPart += `, ${entry.page}`
    parts.push(`${inPart}.`)
    const loc = [entry['publisher-place'], entry.publisher].filter(Boolean).join(': ')
    if (loc) parts.push(`${loc}.`)
  } else if (entry.type === 'webpage') {
    parts.push(`"${title}."`)
    if (entry.URL) parts.push(entry.URL)
  } else {
    // book, report, thesis, paper-conference
    parts.push(`${title}.`)
    const loc = [entry['publisher-place'], entry.publisher].filter(Boolean).join(': ')
    if (loc) parts.push(`${loc}.`)
    else if (entry.publisher) parts.push(`${entry.publisher}.`)
    if (entry.DOI) parts.push(`https://doi.org/${entry.DOI}`)
    else if (entry.URL) parts.push(entry.URL)
  }

  return parts.join(' ').trim()
}

// ---------------------------------------------------------------------------
// Bibliography list (sorted)
// ---------------------------------------------------------------------------

/**
 * Full reference list, sorted:
 * APA/Chicago: by author family name then year.
 * MLA:         by author family name then title.
 */
export function formatBibliography(
  entries: CslEntry[],
  style: CiteStyle,
): { id: string; text: string }[] {
  const sorted = [...entries].sort((a, b) => {
    const aFamily = a.author?.[0]?.family ?? a.author?.[0]?.literal ?? a.title ?? ''
    const bFamily = b.author?.[0]?.family ?? b.author?.[0]?.literal ?? b.title ?? ''
    const familyCmp = aFamily.localeCompare(bFamily, 'en', { sensitivity: 'base' })
    if (familyCmp !== 0) return familyCmp

    if (style === 'mla') {
      const aTitle = a.title ?? ''
      const bTitle = b.title ?? ''
      return aTitle.localeCompare(bTitle, 'en', { sensitivity: 'base' })
    }

    const aYear = getYear(a)
    const bYear = getYear(b)
    return aYear.localeCompare(bYear, 'en', { sensitivity: 'base' })
  })

  return sorted.map((e) => ({ id: e.id, text: formatBibliographyEntry(e, style) }))
}

/**
 * Short label for autocomplete: "Smith 2020 — Title…"
 * Truncates title at 40 chars.
 */
export function citeLabel(entry: CslEntry): string {
  const family = entry.author?.[0]?.family ?? entry.author?.[0]?.literal ?? ''
  const year = getYear(entry)
  const title = entry.title
    ? entry.title.length > 40
      ? `${entry.title.slice(0, 37)}…`
      : entry.title
    : ''
  const authorPart = family ? `${family} ${year}` : year
  return title ? `${authorPart} — ${title}` : authorPart
}
