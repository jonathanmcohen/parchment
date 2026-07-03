// @vitest-environment node
//
// v0.2.10 image UX pass — markdown serialize/parse round-trip for the image node.
// Runs in the node env (serialize.ts / parse.ts import NO editor graph / DOM).
//
// Asserts:
//   - a full-featured image (width/height/align/position/caption/alt/refId) is
//     serialized to a ```parchment:figure fence and reconstructed losslessly;
//   - the NEW `align` attr (left/center/right) survives the round-trip;
//   - a plain-markdown image `![alt](src)` (hand-authored in a .md file) parses
//     BACK into an image node — the parser inline path recognizes the marked
//     `image` token (previously dropped as plain text);
//   - a caption-less / attr-light image still round-trips;
//   - a malformed parchment:figure fence degrades without throwing.

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

const FULL_IMAGE = {
  type: 'image',
  attrs: {
    src: 'https://example.com/cat.png',
    alt: 'A tabby cat',
    caption: 'Our office cat',
    refId: 'fig-cat-1',
    position: 'inline',
    align: 'right',
    width: 320,
    height: 240,
    lockAspect: true,
  },
}

describe('v0.2.10 — image serialize/parse round-trip', () => {
  it('serializes a full image to a parchment:figure fence', () => {
    const md = serializeMarkdown(doc(FULL_IMAGE))
    expect(md).toContain('```parchment:figure')
    const fenceBody = md.match(/```parchment:figure\n([\s\S]*?)\n```/)?.[1] ?? ''
    expect(fenceBody).toBeTruthy()
    const parsed = JSON.parse(fenceBody) as Record<string, unknown>
    expect(parsed.src).toBe('https://example.com/cat.png')
    expect(parsed.alt).toBe('A tabby cat')
    expect(parsed.caption).toBe('Our office cat')
    expect(parsed.align).toBe('right')
    expect(parsed.width).toBe(320)
  })

  it('round-trips every image attr including the new align', () => {
    const md = serializeMarkdown(doc(FULL_IMAGE))
    const back = markdownToJson(md) as Node
    const img = find(back, (n) => n.type === 'image')
    expect(img).toBeDefined()
    expect(img?.attrs?.src).toBe('https://example.com/cat.png')
    expect(img?.attrs?.alt).toBe('A tabby cat')
    expect(img?.attrs?.caption).toBe('Our office cat')
    expect(img?.attrs?.refId).toBe('fig-cat-1')
    expect(img?.attrs?.align).toBe('right')
    expect(img?.attrs?.position).toBe('inline')
    expect(img?.attrs?.width).toBe(320)
    expect(img?.attrs?.height).toBe(240)
    expect(img?.attrs?.lockAspect).toBe(true)
  })

  it('align defaults to center when the fence omits it (legacy G8a figures)', () => {
    // A pre-align figure fence written by v0.2.0 has no `align` key.
    const legacy =
      '```parchment:figure\n' +
      JSON.stringify({ src: 'https://x/y.png', alt: 'y', caption: '', position: 'inline' }) +
      '\n```\n'
    const back = markdownToJson(legacy) as Node
    const img = find(back, (n) => n.type === 'image')
    expect(img?.attrs?.align).toBe('center')
  })

  it('parses a plain-markdown image ![alt](src) back into an image node', () => {
    // Hand-authored markdown that never went through the editor.
    const md = '![A wide banner](https://example.com/banner.jpg)\n'
    const back = markdownToJson(md) as Node
    const img = find(back, (n) => n.type === 'image')
    expect(img).toBeDefined()
    expect(img?.attrs?.src).toBe('https://example.com/banner.jpg')
    expect(img?.attrs?.alt).toBe('A wide banner')
  })

  it('round-trips a bare figure with no caption/refId', () => {
    const bare = {
      type: 'image',
      attrs: {
        src: '/assets/doc1/pic.png',
        alt: 'a picture',
        caption: '',
        refId: '',
        position: 'inline',
        align: 'center',
        width: null,
        height: null,
        lockAspect: true,
      },
    }
    const md = serializeMarkdown(doc(bare))
    const back = markdownToJson(md) as Node
    const img = find(back, (n) => n.type === 'image')
    expect(img?.attrs?.src).toBe('/assets/doc1/pic.png')
    expect(img?.attrs?.alt).toBe('a picture')
    expect(img?.attrs?.width).toBeNull()
  })

  it('a malformed parchment:figure fence degrades without throwing', () => {
    const malformed = '```parchment:figure\n{not json!!!\n```\n'
    let result: Node | undefined
    expect(() => {
      result = markdownToJson(malformed) as Node
    }).not.toThrow()
    expect(find(result, (n) => n.type === 'image')).toBeUndefined()
  })
})
