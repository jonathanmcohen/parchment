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

  it('inserts with align=center by default', () => {
    editor.commands.insertImage({ src: 'https://example.com/img.png', alt: 'test' })
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img?.attrs?.align).toBe('center')
  })
})

// ── Bubble-toolbar attr commands (v0.2.10) ──────────────────────────────────

describe('image attr commands (align / alt / caption / width)', () => {
  let editor: Editor

  /** Insert one image and leave it selected via a NodeSelection at its pos. */
  function insertAndSelectImage(): void {
    editor.commands.insertImage({ src: 'https://example.com/i.png', alt: 'orig alt' })
    // Find the image position and select the node.
    let imgPos = -1
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'image') {
        imgPos = pos
        return false
      }
      return true
    })
    expect(imgPos).toBeGreaterThanOrEqual(0)
    editor.commands.setNodeSelection(imgPos)
  }

  beforeEach(() => {
    editor = new Editor({ extensions: baseExtensions, content: '<p>hi</p>' })
  })
  afterEach(() => {
    editor.destroy()
  })

  it('setImageAlign updates the align attr of the selected image', () => {
    insertAndSelectImage()
    const ok = editor.commands.setImageAlign('right')
    expect(ok).toBe(true)
    const img = findNode(editor.getJSON() as DocJson, 'image')
    expect(img?.attrs?.align).toBe('right')
  })

  it('setImageAlign returns false when no image is selected', () => {
    // selection sits in the paragraph, not on an image
    editor.commands.setTextSelection(1)
    expect(editor.commands.setImageAlign('left')).toBe(false)
  })

  it('setImageAlt updates the alt attr of the selected image', () => {
    insertAndSelectImage()
    const ok = editor.commands.setImageAlt('new descriptive alt')
    expect(ok).toBe(true)
    const img = findNode(editor.getJSON() as DocJson, 'image')
    expect(img?.attrs?.alt).toBe('new descriptive alt')
  })

  it('setImageAlt rejects an empty/whitespace alt (a11y gate preserved)', () => {
    insertAndSelectImage()
    expect(editor.commands.setImageAlt('   ')).toBe(false)
    const img = findNode(editor.getJSON() as DocJson, 'image')
    // alt unchanged — still the original non-empty value
    expect(img?.attrs?.alt).toBe('orig alt')
  })

  it('setImageCaption updates the caption attr (empty allowed — caption is optional)', () => {
    insertAndSelectImage()
    expect(editor.commands.setImageCaption('A nice caption')).toBe(true)
    let img = findNode(editor.getJSON() as DocJson, 'image')
    expect(img?.attrs?.caption).toBe('A nice caption')
    // clearing the caption is allowed
    expect(editor.commands.setImageCaption('')).toBe(true)
    img = findNode(editor.getJSON() as DocJson, 'image')
    expect(img?.attrs?.caption).toBe('')
  })

  it('setImageWidth updates the width attr and clears height (auto)', () => {
    insertAndSelectImage()
    expect(editor.commands.setImageWidth(300)).toBe(true)
    const img = findNode(editor.getJSON() as DocJson, 'image')
    expect(img?.attrs?.width).toBe(300)
    expect(img?.attrs?.height).toBeNull()
  })

  it('each attr command emits exactly one step and preserves sibling attrs (collab-safe)', () => {
    insertAndSelectImage()
    // Set a width first so we can prove setImageAlign leaves it untouched.
    editor.commands.setImageWidth(250)
    let steps = 0
    const onTr = () => {
      steps += 1
    }
    editor.on('transaction', onTr)
    editor.commands.setImageAlign('left')
    editor.off('transaction', onTr)
    // Exactly one transaction dispatched by the command.
    expect(steps).toBe(1)
    const img = findNode(editor.getJSON() as DocJson, 'image')
    // align changed, but src/alt/width from prior state are intact (targeted markup).
    expect(img?.attrs?.align).toBe('left')
    expect(img?.attrs?.width).toBe(250)
    expect(img?.attrs?.src).toBe('https://example.com/i.png')
    expect(img?.attrs?.alt).toBe('orig alt')
  })
})
