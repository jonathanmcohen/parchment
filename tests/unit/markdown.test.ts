import { describe, expect, it } from 'vitest'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// B0 baseline: derive canonical markdown from ProseMirror JSON (one-way).
// Bidirectional/lossless round-trip is Plan F.

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: 'text',
  text: t,
  ...(marks ? { marks } : {}),
})

describe('serializeMarkdown', () => {
  it('headings H1-H6', () => {
    expect(
      serializeMarkdown(doc({ type: 'heading', attrs: { level: 1 }, content: [text('Hi')] })),
    ).toBe('# Hi\n')
    expect(
      serializeMarkdown(doc({ type: 'heading', attrs: { level: 3 }, content: [text('Sub')] })),
    ).toBe('### Sub\n')
  })

  it('paragraphs separated by blank lines', () => {
    expect(serializeMarkdown(doc(p(text('a')), p(text('b'))))).toBe('a\n\nb\n')
  })

  it('inline marks: bold, italic, code, strike', () => {
    expect(serializeMarkdown(doc(p(text('b', [{ type: 'bold' }]))))).toBe('**b**\n')
    expect(serializeMarkdown(doc(p(text('i', [{ type: 'italic' }]))))).toBe('*i*\n')
    expect(serializeMarkdown(doc(p(text('c', [{ type: 'code' }]))))).toBe('`c`\n')
    expect(serializeMarkdown(doc(p(text('s', [{ type: 'strike' }]))))).toBe('~~s~~\n')
  })

  it('nested bold+italic', () => {
    expect(serializeMarkdown(doc(p(text('x', [{ type: 'bold' }, { type: 'italic' }]))))).toBe(
      '***x***\n',
    )
  })

  it('bullet and ordered lists', () => {
    const li = (t: string) => ({ type: 'listItem', content: [p(text(t))] })
    expect(serializeMarkdown(doc({ type: 'bulletList', content: [li('one'), li('two')] }))).toBe(
      '- one\n- two\n',
    )
    expect(serializeMarkdown(doc({ type: 'orderedList', content: [li('one'), li('two')] }))).toBe(
      '1. one\n2. two\n',
    )
  })

  it('blockquote', () => {
    expect(serializeMarkdown(doc({ type: 'blockquote', content: [p(text('quoted'))] }))).toBe(
      '> quoted\n',
    )
  })

  it('code block with language', () => {
    expect(
      serializeMarkdown(
        doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const x = 1')] }),
      ),
    ).toBe('```ts\nconst x = 1\n```\n')
  })

  it('horizontal rule and links', () => {
    expect(serializeMarkdown(doc({ type: 'horizontalRule' }))).toBe('---\n')
    expect(
      serializeMarkdown(doc(p(text('site', [{ type: 'link', attrs: { href: 'https://x.dev' } }])))),
    ).toBe('[site](https://x.dev)\n')
  })

  it('escapes markdown special characters in text', () => {
    expect(serializeMarkdown(doc(p(text('a*b_c'))))).toBe('a\\*b\\_c\n')
  })

  // ── H1 Task 10 — comments stay DB-only; the markdown sidecar stays clean ──
  it('does NOT emit the comment mark / data-thread-id (comments are DB-only)', () => {
    const md = serializeMarkdown(
      doc(p(text('hello', [{ type: 'comment', attrs: { threadId: 'abc-123' } }]))),
    )
    expect(md).toBe('hello\n')
    expect(md).not.toContain('data-thread-id')
    expect(md).not.toContain('abc-123')
    expect(md).not.toContain('comment')
  })
})
