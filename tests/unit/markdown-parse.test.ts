// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'

// F2: markdown → ProseMirror JSON via a hand-rolled marked-token walk (no editor
// graph / no @tiptap/html — must load in the Next server runtime). Standard
// markdown round-trips; Parchment custom blocks are F3 (lossless form).

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: { type: string }[]
}

/** Depth-first find of the first node matching the predicate. */
function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

describe('markdownToJson', () => {
  it('returns a valid doc node', () => {
    const json = markdownToJson('hello') as Node
    expect(json.type).toBe('doc')
    expect(Array.isArray(json.content)).toBe(true)
  })

  it('parses a level-1 heading and a paragraph with a bold mark', () => {
    const json = markdownToJson('# Title\n\nhello **world**') as Node

    const heading = find(json, (n) => n.type === 'heading')
    expect(heading).toBeDefined()
    expect(heading?.attrs?.level).toBe(1)
    expect(find(heading, (n) => n.text === 'Title')).toBeDefined()

    const paragraph = find(json, (n) => n.type === 'paragraph')
    expect(paragraph).toBeDefined()
    const bold = find(paragraph, (n) => (n.marks ?? []).some((m) => m.type === 'bold'))
    expect(bold).toBeDefined()
    expect(bold?.text).toBe('world')
  })

  it('parses a fenced code block to a codeBlock node', () => {
    const json = markdownToJson('```ts\nconst x = 1\n```') as Node
    const code = find(json, (n) => n.type === 'codeBlock')
    expect(code).toBeDefined()
    expect(
      find(code, (n) => typeof n.text === 'string' && n.text.includes('const x = 1')),
    ).toBeDefined()
  })

  it('parses a bullet list', () => {
    const json = markdownToJson('- one\n- two') as Node
    expect(find(json, (n) => n.type === 'bulletList')).toBeDefined()
  })

  it('empty string yields an empty/paragraph doc, never throws', () => {
    const json = markdownToJson('') as Node
    expect(json.type).toBe('doc')
  })

  it('never throws on garbage / non-markdown bytes', () => {
    expect(() => markdownToJson('\x00\x01<<<<>>>> [unclosed](')).not.toThrow()
    const json = markdownToJson('\x00\x01<<<<>>>> [unclosed](') as Node
    expect(json.type).toBe('doc')
  })
})
