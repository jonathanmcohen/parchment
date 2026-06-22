import { describe, expect, it } from 'vitest'
import { docToPlainText } from '@/lib/export/plain-text'

const doc = (blocks: unknown[]) => ({ type: 'doc', content: blocks })
const heading = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})
const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})
const bullet = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((t) => ({
    type: 'listItem',
    content: [para(t)],
  })),
})
const ordered = (...items: string[]) => ({
  type: 'orderedList',
  content: items.map((t) => ({
    type: 'listItem',
    content: [para(t)],
  })),
})

describe('docToPlainText', () => {
  it('heading + paragraph + bulletList → expected line layout', () => {
    const result = docToPlainText(doc([heading(1, 'My Title'), para('Hello world'), bullet('A', 'B')]))
    expect(result).toContain('My Title')
    expect(result).toContain('Hello world')
    expect(result).toContain('- A')
    expect(result).toContain('- B')
    // blank lines between blocks
    expect(result).toMatch(/My Title\n\nHello world/)
  })

  it('nested marks are stripped to plain text', () => {
    const nodeWithMarks = {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'bold italic',
          marks: [{ type: 'bold' }, { type: 'italic' }],
        },
      ],
    }
    const result = docToPlainText(doc([nodeWithMarks]))
    expect(result).toContain('bold italic')
    expect(result).not.toContain('**')
    expect(result).not.toContain('*')
  })

  it('empty doc returns empty string', () => {
    expect(docToPlainText(doc([]))).toBe('')
    expect(docToPlainText({})).toBe('')
    expect(docToPlainText(null)).toBe('')
  })

  it('table → tab-separated rows', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [para('A')] },
            { type: 'tableCell', content: [para('B')] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [para('1')] },
            { type: 'tableCell', content: [para('2')] },
          ],
        },
      ],
    }
    const result = docToPlainText(doc([table]))
    expect(result).toContain('A\tB')
    expect(result).toContain('1\t2')
  })

  it('orderedList has numbered prefixes', () => {
    const result = docToPlainText(doc([ordered('First', 'Second', 'Third')]))
    expect(result).toContain('1. First')
    expect(result).toContain('2. Second')
    expect(result).toContain('3. Third')
  })

  it('never throws on malformed input', () => {
    expect(() => docToPlainText('not a doc')).not.toThrow()
    expect(() => docToPlainText({ type: 'doc', content: [{ type: null }] })).not.toThrow()
    expect(() => docToPlainText(42)).not.toThrow()
    expect(() => docToPlainText({ type: 'doc', content: null })).not.toThrow()
  })
})
