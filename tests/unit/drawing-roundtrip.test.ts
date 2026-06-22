// @vitest-environment node
//
// G5: drawing serialize/parse round-trip. serialize.ts / parse.ts handle scene
// + svg as plain JSON/string only — they import NO excalidraw and NO editor
// graph (server-runtime safe). This suite asserts:
//   - a drawing node serializes to a ```parchment:drawing fence with its JSON body;
//   - the fence JSON body contains the scene elements and the svg;
//   - parseMarkdown reconstructs the drawing node with the scene and svg preserved;
//   - scene.elements[0].id is preserved verbatim;
//   - a malformed parchment:drawing fence body (invalid JSON) parses without
//     throwing and falls back to a plain codeBlock.
// Runs in the node env with zero excalidraw deps.

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

const SCENE = {
  elements: [{ type: 'rectangle', id: 'a' }],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
}
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'

const DRAWING_NODE = {
  type: 'drawing',
  attrs: { scene: SCENE, svg: SVG },
}

describe('G5 — drawing serialize/parse round-trip', () => {
  it('serializes a drawing node to a parchment:drawing fence', () => {
    const original = doc(DRAWING_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('```parchment:drawing')
    expect(md).toContain('```')
  })

  it('fence JSON body contains the scene and svg', () => {
    const original = doc(DRAWING_NODE)
    const md = serializeMarkdown(original)
    // Extract the JSON body from the fence
    const fenceBody = md.match(/```parchment:drawing\n([\s\S]*?)\n```/)?.[1] ?? ''
    expect(fenceBody).toBeTruthy()
    const parsed = JSON.parse(fenceBody) as { type: string; attrs: { scene: typeof SCENE; svg: string } }
    expect(parsed.type).toBe('drawing')
    expect(parsed.attrs.scene.elements[0]?.id).toBe('a')
    expect(parsed.attrs.svg).toBe(SVG)
  })

  it('parseMarkdown reconstructs a drawing node with scene and svg preserved', () => {
    const original = doc(DRAWING_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'drawing')
    expect(node).toBeDefined()
    expect(node?.attrs?.svg).toBe(SVG)
    const scene = node?.attrs?.scene as typeof SCENE | undefined
    expect(scene?.elements[0]?.id).toBe('a')
  })

  it('preserves scene.elements[0].id through the full round-trip', () => {
    const original = doc(DRAWING_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'drawing')
    const scene = node?.attrs?.scene as { elements: Array<{ id: string }> } | undefined
    expect(scene?.elements[0]?.id).toBe('a')
  })

  it('a malformed parchment:drawing fence body parses without throwing', () => {
    const malformed = '```parchment:drawing\n{invalid json!!!\n```\n'
    // Should not throw; should degrade to a codeBlock
    let result: Node | undefined
    expect(() => {
      result = markdownToJson(malformed) as Node
    }).not.toThrow()
    // The malformed fence falls back to a plain codeBlock (not a drawing node)
    const drawingNode = find(result, (n) => n.type === 'drawing')
    expect(drawingNode).toBeUndefined()
  })
})
