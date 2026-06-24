import { describe, expect, it } from 'vitest'
import { plainTextToContent } from '@/lib/editor/clipboard'

describe('plainTextToContent', () => {
  it('wraps a single line in one paragraph', () => {
    expect(plainTextToContent('hello world')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(plainTextToContent('')).toEqual([])
  })

  it('splits blank-line-separated blocks into separate paragraphs', () => {
    expect(plainTextToContent('first para\n\nsecond para')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'first para' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'second para' }] },
    ])
  })

  it('turns single newlines inside a block into hardBreak nodes', () => {
    expect(plainTextToContent('line one\nline two')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'line one' },
          { type: 'hardBreak' },
          { type: 'text', text: 'line two' },
        ],
      },
    ])
  })

  it('normalizes CRLF and CR to LF', () => {
    expect(plainTextToContent('a\r\nb\rc')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
          { type: 'hardBreak' },
          { type: 'text', text: 'c' },
        ],
      },
    ])
  })

  it('produces empty paragraphs for blank lines within a block boundary, not text marks', () => {
    // Three blocks separated by blank lines collapse runs of blank lines.
    expect(plainTextToContent('a\n\n\n\nb')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ])
  })

  it('carries no marks on any text node (formatting stripped)', () => {
    const out = plainTextToContent('**not bold** plain')
    // The literal asterisks survive as plain text — nothing is interpreted as a mark.
    expect(out).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '**not bold** plain' }] },
    ])
  })

  it('treats whitespace-only input as empty', () => {
    expect(plainTextToContent('   \n  \n ')).toEqual([])
  })
})
