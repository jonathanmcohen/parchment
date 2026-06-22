import { describe, expect, it } from 'vitest'
import { formatBibliography, formatBibliographyEntry, formatInText } from '@/lib/citations/format'
import { parseCslEntries } from '@/lib/citations/types'
import type { CslEntry } from '@/lib/citations/types'

// Fixtures
const smith1: CslEntry = {
  id: 'smith2020',
  type: 'article-journal',
  title: 'Cognitive Load Theory Revisited',
  author: [{ family: 'Smith', given: 'Alice' }],
  issued: { 'date-parts': [[2020]] },
  'container-title': 'Journal of Education',
  volume: '12',
  issue: '3',
  page: '45-67',
  DOI: '10.1234/edu.2020',
}

const two: CslEntry = {
  id: 'smith2018',
  type: 'book',
  title: 'Learning Theories',
  author: [
    { family: 'Smith', given: 'Alice' },
    { family: 'Jones', given: 'Karen' },
  ],
  issued: { 'date-parts': [[2018]] },
  publisher: 'Academic Press',
}

const three: CslEntry = {
  id: 'brown2021',
  type: 'article-journal',
  title: 'Neural Networks for NLP',
  author: [
    { family: 'Brown', given: 'James' },
    { family: 'Lee', given: 'Sarah' },
    { family: 'Wang', given: 'Mei' },
  ],
  issued: { 'date-parts': [[2021]] },
  'container-title': 'AI Review',
}

const noDate: CslEntry = {
  id: 'anon',
  type: 'webpage',
  title: 'Some Web Page',
  URL: 'https://example.com',
}

describe('formatInText', () => {
  it('APA single author with year', () => {
    expect(formatInText(smith1, 'apa')).toBe('(Smith, 2020)')
  })

  it('APA single author with page', () => {
    expect(formatInText(smith1, 'apa', { page: '50' })).toBe('(Smith, 2020, p. 50)')
  })

  it('APA two authors uses ampersand', () => {
    expect(formatInText(two, 'apa')).toBe('(Smith & Jones, 2018)')
  })

  it('APA three+ authors → et al.', () => {
    expect(formatInText(three, 'apa')).toBe('(Brown et al., 2021)')
  })

  it('APA no date → n.d. (title fallback when no author)', () => {
    // No author: formatter falls back to title prefix; year is "n.d."
    const result = formatInText(noDate, 'apa')
    expect(result).toContain('n.d.')
    expect(result).toMatch(/^\(/)
  })

  it('MLA single author with page — no year', () => {
    expect(formatInText(smith1, 'mla', { page: '50' })).toBe('(Smith 50)')
  })

  it('MLA two authors uses "and"', () => {
    expect(formatInText(two, 'mla')).toBe('(Smith and Jones)')
  })

  it('Chicago two authors — year in citation', () => {
    expect(formatInText(two, 'chicago')).toBe('(Smith and Jones 2018)')
  })

  it('Chicago with page', () => {
    expect(formatInText(smith1, 'chicago', { page: '50' })).toBe('(Smith 2020, 50)')
  })
})

describe('formatBibliographyEntry', () => {
  it('APA article-journal includes DOI URL', () => {
    const text = formatBibliographyEntry(smith1, 'apa')
    expect(text).toContain('Smith')
    expect(text).toContain('(2020)')
    expect(text).toContain('Cognitive Load Theory Revisited')
    expect(text).toContain('Journal of Education')
    expect(text).toContain('https://doi.org/10.1234/edu.2020')
  })

  it('MLA article-journal uses quoted title and "vol."', () => {
    const text = formatBibliographyEntry(smith1, 'mla')
    expect(text).toContain('"Cognitive Load Theory Revisited."')
    expect(text).toContain('vol. 12')
    expect(text).toContain('no. 3')
  })

  it('Chicago article-journal uses quoted title and colon for pages', () => {
    const text = formatBibliographyEntry(smith1, 'chicago')
    expect(text).toContain('"Cognitive Load Theory Revisited."')
    expect(text).toContain(': 45-67')
  })

  it('APA book includes Publisher', () => {
    const text = formatBibliographyEntry(two, 'apa')
    expect(text).toContain('Academic Press')
    expect(text).toContain('(2018)')
  })

  it('MLA book uses Publisher then year', () => {
    const text = formatBibliographyEntry(two, 'mla')
    expect(text).toContain('Academic Press')
    expect(text).toContain('2018')
    // MLA and APA must be visibly different — MLA has no parentheses around year
    expect(text).not.toContain('(2018)')
  })

  it('Chicago book differs from APA — no parentheses around year', () => {
    const text = formatBibliographyEntry(two, 'chicago')
    expect(text).not.toContain('(2018)')
    expect(text).toContain('2018')
  })
})

describe('formatBibliography', () => {
  it('sorts by author family name (APA)', () => {
    const list = formatBibliography([smith1, three, two], 'apa')
    // Brown < Smith
    expect(list[0]?.id).toBe('brown2021')
    expect(list[1]?.id === 'smith2020' || list[2]?.id === 'smith2020').toBe(true)
  })
})

describe('parseCslEntries', () => {
  it('keeps a valid entry', () => {
    const result = parseCslEntries([{ id: 'a1', type: 'book', title: 'Test' }])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('a1')
  })

  it('drops entry missing id', () => {
    const result = parseCslEntries([{ type: 'book', title: 'No ID' }])
    expect(result).toHaveLength(0)
  })

  it('drops entry with unknown type', () => {
    const result = parseCslEntries([{ id: 'x1', type: 'unknown-type', title: 'Bad Type' }])
    expect(result).toHaveLength(0)
  })

  it('returns [] for non-array input', () => {
    expect(parseCslEntries(null)).toHaveLength(0)
    expect(parseCslEntries({ id: 'a', type: 'book' })).toHaveLength(0)
  })
})
