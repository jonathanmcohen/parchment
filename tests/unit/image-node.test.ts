// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertImageAttrs } from '@/lib/editor/extensions/image'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// ── Helpers ────────────────────────────────────────────────────────────────

type AnyNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: AnyNode[]
}

type DocJson = AnyNode

/** Walk the JSON tree and find the first node of a given type. */
function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const found = findNode(child, type)
    if (found) return found
  }
  return undefined
}

// ── Guard tests ────────────────────────────────────────────────────────────

describe('assertImageAttrs', () => {
  it('returns {ok:true} when src and alt are present and non-empty', () => {
    expect(assertImageAttrs({ src: 'x', alt: 'a' })).toEqual({ ok: true })
  })

  it('returns {ok:false} when alt is missing', () => {
    const result = assertImageAttrs({ src: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('returns {ok:false} when alt is empty string', () => {
    const result = assertImageAttrs({ src: 'x', alt: '' })
    expect(result.ok).toBe(false)
  })

  it('returns {ok:false} when src is missing', () => {
    const result = assertImageAttrs({ alt: 'a' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('returns {ok:false} when src is empty string', () => {
    const result = assertImageAttrs({ src: '', alt: 'a' })
    expect(result.ok).toBe(false)
  })

  it('returns {ok:false} when both src and alt are missing', () => {
    const result = assertImageAttrs({})
    expect(result.ok).toBe(false)
  })
})

// ── Headless editor command tests ──────────────────────────────────────────

describe('insertImage command', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: baseExtensions,
      content: '<p>hello</p>',
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('inserts an image node with the correct alt attribute when both src and alt are provided', () => {
    const ok = editor.commands.insertImage({ src: 'https://example.com/img.png', alt: 'A cat' })
    expect(ok).toBe(true)
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img).toBeDefined()
    expect(img?.attrs?.alt).toBe('A cat')
    expect(img?.attrs?.src).toBe('https://example.com/img.png')
  })

  it('stores position attribute on the inserted image node', () => {
    editor.commands.insertImage({
      src: 'https://example.com/img.png',
      alt: 'Logo',
      position: 'wrap-left',
    })
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img?.attrs?.position).toBe('wrap-left')
  })

  it('does NOT insert an image node when alt is missing (guard blocks it)', () => {
    const before = editor.getJSON() as DocJson
    const beforeImg = findNode(before, 'image')
    expect(beforeImg).toBeUndefined()

    const ok = editor.commands.insertImage({ src: 'https://example.com/img.png' })
    expect(ok).toBe(false)

    const after = editor.getJSON() as DocJson
    const afterImg = findNode(after, 'image')
    expect(afterImg).toBeUndefined()
  })

  it('does NOT insert an image node when alt is an empty string', () => {
    const ok = editor.commands.insertImage({ src: 'https://example.com/img.png', alt: '' })
    expect(ok).toBe(false)
    const doc = editor.getJSON() as DocJson
    expect(findNode(doc, 'image')).toBeUndefined()
  })

  it('does NOT insert an image node when src is missing', () => {
    const ok = editor.commands.insertImage({ alt: 'no src' })
    expect(ok).toBe(false)
    const doc = editor.getJSON() as DocJson
    expect(findNode(doc, 'image')).toBeUndefined()
  })

  it('sets lockAspect true by default', () => {
    editor.commands.insertImage({ src: 'https://example.com/img.png', alt: 'test' })
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img?.attrs?.lockAspect).toBe(true)
  })

  it('respects explicit lockAspect false', () => {
    editor.commands.insertImage({
      src: 'https://example.com/img.png',
      alt: 'test',
      lockAspect: false,
    })
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img?.attrs?.lockAspect).toBe(false)
  })
})
