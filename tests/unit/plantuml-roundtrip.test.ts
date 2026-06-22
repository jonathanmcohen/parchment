// @vitest-environment node
//
// G6b: plantuml serialize/parse round-trip. serialize.ts / parse.ts handle the
// plantuml source as a plain string only — they import NO plantuml lib and NO
// editor graph (server-runtime safe). This suite asserts:
//   - a plantuml node serializes to a ```plantuml code fence;
//   - the fence body contains the source text (including newlines);
//   - parseMarkdown reconstructs the plantuml node with the source preserved;
//   - a normal ```js code fence still parses to a codeBlock (NOT a plantuml node).
// Runs in the node env with zero plantuml deps.

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

const SOURCE = '@startuml\nA->B\n@enduml'

const PLANTUML_NODE = {
  type: 'plantuml',
  attrs: { source: SOURCE },
}

describe('G6b — plantuml serialize/parse round-trip', () => {
  it('serializes a plantuml node to a standard ```plantuml code fence', () => {
    const original = doc(PLANTUML_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('```plantuml')
    expect(md).toContain('```')
    // Must NOT use the parchment: reserved namespace
    expect(md).not.toContain('```parchment:plantuml')
  })

  it('fence body contains the source text including newlines', () => {
    const original = doc(PLANTUML_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('@startuml')
    expect(md).toContain('A->B')
    expect(md).toContain('@enduml')
  })

  it('parseMarkdown reconstructs a plantuml node with the source preserved', () => {
    const original = doc(PLANTUML_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'plantuml')
    expect(node).toBeDefined()
    expect(node?.attrs?.source).toBe(SOURCE)
  })

  it('source including embedded newlines round-trips verbatim', () => {
    const original = doc(PLANTUML_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'plantuml')
    // The newlines inside the source must survive serialize → parse
    expect(node?.attrs?.source).toContain('\n')
    expect(node?.attrs?.source).toBe(SOURCE)
  })

  it('a normal ```js code fence still parses to a codeBlock (NOT a plantuml node)', () => {
    const jsFence = '```js\nconsole.log("hello");\n```\n'
    const back = markdownToJson(jsFence) as Node
    const plantumlNode = find(back, (n) => n.type === 'plantuml')
    expect(plantumlNode).toBeUndefined()
    const codeBlock = find(back, (n) => n.type === 'codeBlock')
    expect(codeBlock).toBeDefined()
    expect(codeBlock?.attrs?.language).toBe('js')
  })
})
