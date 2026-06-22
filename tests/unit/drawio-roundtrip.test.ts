// @vitest-environment node
//
// G6c: drawio serialize/parse round-trip. serialize.ts / parse.ts handle xml
// + svg as plain strings only — they import NO drawio library and NO editor
// graph (server-runtime safe). This suite asserts:
//   - a drawio node serializes to a ```parchment:drawio fence with its JSON body;
//   - the fence JSON body contains the xml and svg;
//   - parseMarkdown reconstructs the drawio node with xml and svg preserved;
//   - a malformed parchment:drawio fence body (invalid JSON) parses without
//     throwing and falls back to a plain codeBlock.
// Runs in the node env with zero drawio deps.

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

const XML = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'

const DRAWIO_NODE = {
  type: 'drawio',
  attrs: { xml: XML, svg: SVG },
}

describe('G6c — drawio serialize/parse round-trip', () => {
  it('serializes a drawio node to a parchment:drawio fence', () => {
    const original = doc(DRAWIO_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('```parchment:drawio')
    expect(md).toContain('```')
  })

  it('fence JSON body contains the xml and svg', () => {
    const original = doc(DRAWIO_NODE)
    const md = serializeMarkdown(original)
    const fenceBody = md.match(/```parchment:drawio\n([\s\S]*?)\n```/)?.[1] ?? ''
    expect(fenceBody).toBeTruthy()
    const parsed = JSON.parse(fenceBody) as { type: string; attrs: { xml: string; svg: string } }
    expect(parsed.type).toBe('drawio')
    expect(parsed.attrs.xml).toBe(XML)
    expect(parsed.attrs.svg).toBe(SVG)
  })

  it('parseMarkdown reconstructs a drawio node with xml and svg preserved', () => {
    const original = doc(DRAWIO_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'drawio')
    expect(node).toBeDefined()
    expect(node?.attrs?.xml).toBe(XML)
    expect(node?.attrs?.svg).toBe(SVG)
  })

  it('a malformed parchment:drawio fence body parses without throwing', () => {
    const malformed = '```parchment:drawio\n{invalid json!!!\n```\n'
    let result: Node | undefined
    expect(() => {
      result = markdownToJson(malformed) as Node
    }).not.toThrow()
    // The malformed fence falls back to a plain codeBlock (not a drawio node)
    const drawioNode = find(result, (n) => n.type === 'drawio')
    expect(drawioNode).toBeUndefined()
  })
})
