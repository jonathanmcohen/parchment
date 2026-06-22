// @vitest-environment node
//
// G6a: mermaid serialize/parse round-trip. serialize.ts / parse.ts handle the
// mermaid source as a plain string only — they import NO mermaid and NO editor
// graph (server-runtime safe). This suite asserts:
//   - a mermaid node serializes to a ```mermaid code fence;
//   - the fence body contains the source text (including newlines);
//   - parseMarkdown reconstructs the mermaid node with the source preserved;
//   - a normal ```js code fence still parses to a codeBlock (NOT a mermaid node);
//   - the source including embedded newlines round-trips verbatim.
// Runs in the node env with zero mermaid deps.

import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })

function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

const SOURCE = 'graph TD;\nA-->B;'

const MERMAID_NODE = {
  type: 'mermaid',
  attrs: { source: SOURCE },
}

describe('G6a — mermaid serialize/parse round-trip', () => {
  it('serializes a mermaid node to a standard ```mermaid code fence', () => {
    const original = doc(MERMAID_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('```mermaid')
    expect(md).toContain('```')
    // Must NOT use the parchment: reserved namespace
    expect(md).not.toContain('```parchment:mermaid')
  })

  it('fence body contains the source text including newlines', () => {
    const original = doc(MERMAID_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('graph TD;')
    expect(md).toContain('A-->B;')
  })

  it('parseMarkdown reconstructs a mermaid node with the source preserved', () => {
    const original = doc(MERMAID_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'mermaid')
    expect(node).toBeDefined()
    expect(node?.attrs?.source).toBe(SOURCE)
  })

  it('source including embedded newline round-trips verbatim', () => {
    const original = doc(MERMAID_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'mermaid')
    // The newline inside the source must survive serialize → parse
    expect(node?.attrs?.source).toContain('\n')
    expect(node?.attrs?.source).toBe(SOURCE)
  })

  it('a normal ```js code fence still parses to a codeBlock (NOT a mermaid node)', () => {
    const jsFence = '```js\nconsole.log("hello");\n```\n'
    const back = markdownToJson(jsFence) as Node
    const mermaidNode = find(back, (n) => n.type === 'mermaid')
    expect(mermaidNode).toBeUndefined()
    const codeBlock = find(back, (n) => n.type === 'codeBlock')
    expect(codeBlock).toBeDefined()
    expect(codeBlock?.attrs?.language).toBe('js')
  })

  it('source containing a bare ``` line round-trips without data loss (four-backtick fence)', () => {
    // Regression: a 3-backtick fence opener is prematurely closed by a bare ```
    // line in the body, silently discarding content after it. The fix is a
    // 4-backtick opener/closer so a bare ``` cannot match the GFM closer.
    const srcWithBackticks = 'graph TD;\n```\nA-->B;'
    const node = { type: 'mermaid', attrs: { source: srcWithBackticks } }
    const md = serializeMarkdown(doc(node))
    // Serialized fence must use 4 backticks
    expect(md).toMatch(/^````mermaid/m)
    // Parse must recover the full source including the bare ``` line
    const back = markdownToJson(md) as Node
    const recovered = find(back, (n) => n.type === 'mermaid')
    expect(recovered).toBeDefined()
    expect(recovered?.attrs?.source).toBe(srcWithBackticks)
  })
})
