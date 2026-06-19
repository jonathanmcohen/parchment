import { describe, expect, it } from 'vitest'
import { collectHeadings } from '@/lib/editor/headings'

// Pure function — no jsdom required.

const makeDoc = (nodes: unknown[]) => ({ type: 'doc', content: nodes })

const h = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})

describe('collectHeadings', () => {
  it('returns empty array for doc with no headings', () => {
    const doc = makeDoc([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }])
    expect(collectHeadings(doc)).toEqual([])
  })

  it('returns ordered {level, text, id} entries', () => {
    const doc = makeDoc([h(1, 'Introduction'), h(2, 'Background'), h(3, 'Details')])
    const entries = collectHeadings(doc)
    expect(entries).toEqual([
      { level: 1, text: 'Introduction', id: 'introduction' },
      { level: 2, text: 'Background', id: 'background' },
      { level: 3, text: 'Details', id: 'details' },
    ])
  })

  it('slugifies heading text', () => {
    const doc = makeDoc([h(1, 'Hello World!')])
    expect(collectHeadings(doc)[0]?.id).toBe('hello-world')
  })

  it('de-duplicates duplicate titles with -2, -3 suffixes', () => {
    const doc = makeDoc([h(2, 'Section'), h(2, 'Section'), h(2, 'Section')])
    const entries = collectHeadings(doc)
    expect(entries[0]?.id).toBe('section')
    expect(entries[1]?.id).toBe('section-2')
    expect(entries[2]?.id).toBe('section-3')
  })

  it('handles headings with inline marks (concatenates text)', () => {
    const doc = makeDoc([
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [
          { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'World' },
        ],
      },
    ])
    const entries = collectHeadings(doc)
    expect(entries[0]?.text).toBe('Hello World')
    expect(entries[0]?.id).toBe('hello-world')
  })

  it('uses "heading" as fallback id for empty heading text', () => {
    const doc = makeDoc([{ type: 'heading', attrs: { level: 2 }, content: [] }])
    const entries = collectHeadings(doc)
    expect(entries[0]?.id).toBe('heading')
  })

  it('handles nested block content', () => {
    const doc = makeDoc([
      { type: 'blockquote', content: [h(2, 'Nested Heading')] },
      h(1, 'Top Level'),
    ])
    const entries = collectHeadings(doc)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.id).toBe('nested-heading')
    expect(entries[1]?.id).toBe('top-level')
  })
})
