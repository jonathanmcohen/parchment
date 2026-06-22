import { describe, expect, it } from 'vitest'
import { crossrefToCsl } from '@/lib/citations/crossref'

// Realistic CrossRef message fixture for a journal article
const journalArticleMsg = {
  DOI: '10.1000/xyz123',
  type: 'journal-article',
  title: ['Deep Learning for Natural Language Processing'],
  author: [
    { family: 'Smith', given: 'Alice' },
    { family: 'Jones', given: 'Karen' },
  ],
  issued: { 'date-parts': [[2021, 6, 15]] },
  'container-title': ['Journal of Artificial Intelligence'],
  publisher: 'Academic Press',
  volume: '15',
  issue: '2',
  page: '100-120',
  URL: 'https://doi.org/10.1000/xyz123',
}

const bookChapterMsg = {
  DOI: '10.9999/chapter1',
  type: 'book-chapter',
  title: ['Introduction to Neural Networks'],
  author: [{ family: 'Brown', given: 'James' }],
  issued: { 'date-parts': [[2019]] },
  'container-title': ['Handbook of AI'],
  publisher: 'MIT Press',
}

describe('crossrefToCsl', () => {
  it('maps a journal-article message to a valid CslEntry', () => {
    const entry = crossrefToCsl(journalArticleMsg)
    expect(entry).not.toBeNull()
    expect(entry?.id).toBe('10.1000/xyz123')
    expect(entry?.type).toBe('article-journal')
    expect(entry?.title).toBe('Deep Learning for Natural Language Processing')
    expect(entry?.author).toHaveLength(2)
    expect(entry?.author?.[0]?.family).toBe('Smith')
    expect(entry?.author?.[1]?.family).toBe('Jones')
    expect(entry?.issued?.['date-parts']?.[0]?.[0]).toBe(2021)
    expect(entry?.['container-title']).toBe('Journal of Artificial Intelligence')
    expect(entry?.DOI).toBe('10.1000/xyz123')
  })

  it('maps "book-chapter" type to "chapter"', () => {
    const entry = crossrefToCsl(bookChapterMsg)
    expect(entry).not.toBeNull()
    expect(entry?.type).toBe('chapter')
    expect(entry?.id).toBe('10.9999/chapter1')
    expect(entry?.['container-title']).toBe('Handbook of AI')
  })

  it('returns null for a message with no title', () => {
    const msg = { DOI: '10.0000/notitle', type: 'journal-article' }
    expect(crossrefToCsl(msg)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(crossrefToCsl(null)).toBeNull()
    expect(crossrefToCsl('string')).toBeNull()
    expect(crossrefToCsl(42)).toBeNull()
    expect(crossrefToCsl(undefined)).toBeNull()
  })

  it('returns null when DOI is missing', () => {
    const msg = { type: 'journal-article', title: ['A Title'] }
    expect(crossrefToCsl(msg)).toBeNull()
  })

  it('maps "proceedings-article" to "paper-conference"', () => {
    const msg = {
      DOI: '10.5555/conf1',
      type: 'proceedings-article',
      title: ['Conference Paper'],
    }
    const entry = crossrefToCsl(msg)
    expect(entry?.type).toBe('paper-conference')
  })
})
