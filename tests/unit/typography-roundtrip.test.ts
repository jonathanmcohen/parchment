// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// v0.2.10 — the smart-typography characters are plain Unicode. The disk-mirror
// markdown must round-trip them byte-clean (serialize → parse → same text), and
// code content must stay EXACTLY as authored (straight quotes inside a fence are
// never smartened, so the fence body must survive verbatim).

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: { type: string }[]
}

const doc = (...content: Node[]): Node => ({ type: 'doc', content })
const p = (...content: Node[]): Node => ({ type: 'paragraph', content })
const text = (t: string): Node => ({ type: 'text', text: t })
const codeBlock = (t: string, language: string | null = null): Node => ({
  type: 'codeBlock',
  attrs: { language },
  content: [text(t)],
})

function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

/** All plain text under a node, concatenated. */
function allText(node: Node | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(allText).join('')
}

const SMART = 'Café “quote” ‘q’ — – … ½ ¼ ¾ → ← © ® ™ it’s'

describe('typography round-trip — smart unicode survives serialize/parse', () => {
  it('a paragraph of smart characters is preserved verbatim', () => {
    const md = serializeMarkdown(doc(p(text(SMART))))
    // No backslash-escaping should touch these characters.
    expect(md).toContain(SMART)
    const back = markdownToJson(md) as Node
    const para = find(back, (n) => n.type === 'paragraph')
    expect(allText(para)).toBe(SMART)
  })

  it('smart double + single quotes are not mangled', () => {
    const s = '“Hello,” she said — it’s ‘fine’.'
    const back = markdownToJson(serializeMarkdown(doc(p(text(s))))) as Node
    expect(allText(find(back, (n) => n.type === 'paragraph'))).toBe(s)
  })

  it('en dash, em dash, ellipsis, fractions, arrows round-trip', () => {
    const s = '1–2 or 3—4, wait… ½ ¼ ¾ a→b c←d'
    const back = markdownToJson(serializeMarkdown(doc(p(text(s))))) as Node
    expect(allText(find(back, (n) => n.type === 'paragraph'))).toBe(s)
  })
})

describe('typography round-trip — code content stays byte-exact', () => {
  it('straight quotes inside a code block are NOT smartened and survive', () => {
    const code = 'const s = "x"\nconst t = \'y\'\nrange = 1--2 // ...'
    const md = serializeMarkdown(doc(codeBlock(code, 'javascript')))
    expect(md).toContain('```javascript')
    expect(md).toContain(code) // verbatim, no smart substitutions
    const back = markdownToJson(md) as Node
    const cb = find(back, (n) => n.type === 'codeBlock')
    expect(cb?.attrs?.language).toBe('javascript')
    expect(allText(cb)).toBe(code)
  })

  it('a doc mixing smart-quote prose + a code block round-trips both correctly', () => {
    const prose = 'She said “use straight quotes in code”.'
    const code = 'printf("hello \'world\'\\n"); // 1/2 not a fraction here'
    const original = doc(p(text(prose)), codeBlock(code, 'c'))
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node

    const para = find(back, (n) => n.type === 'paragraph')
    expect(allText(para)).toBe(prose) // curly quotes preserved in prose

    const cb = find(back, (n) => n.type === 'codeBlock')
    expect(allText(cb)).toBe(code) // straight quotes preserved in code
    expect(cb?.attrs?.language).toBe('c')
  })

  it('inline code with a straight quote round-trips straight', () => {
    const original = doc(
      p(text('use '), { type: 'text', text: 'a["b"]', marks: [{ type: 'code' }] }, text(' here')),
    )
    const back = markdownToJson(serializeMarkdown(original)) as Node
    const codeText = find(back, (n) => (n.marks ?? []).some((m) => m.type === 'code'))
    expect(codeText?.text).toBe('a["b"]') // straight quotes kept inside inline code
  })
})
