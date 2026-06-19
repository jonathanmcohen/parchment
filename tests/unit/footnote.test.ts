// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetFootnoteSeq, numberFootnotes } from '@/lib/editor/extensions/footnote'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// ── Pure unit tests ────────────────────────────────────────────────────────

describe('numberFootnotes (pure)', () => {
  it('assigns 1-based numbers in order', () => {
    const map = numberFootnotes(['a', 'b', 'c'])
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
    expect(map.get('c')).toBe(3)
  })

  it('returns an empty Map for an empty array', () => {
    expect(numberFootnotes([]).size).toBe(0)
  })

  it('handles a single id', () => {
    const map = numberFootnotes(['x'])
    expect(map.get('x')).toBe(1)
  })
})

// ── Headless editor tests ──────────────────────────────────────────────────

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

/** Walk the JSON tree and collect all nodes of a given type. */
function findAllNodes(root: AnyNode, type: string): AnyNode[] {
  const results: AnyNode[] = []
  if (root.type === type) results.push(root)
  for (const child of root.content ?? []) {
    results.push(...findAllNodes(child, type))
  }
  return results
}

let editor: Editor

beforeEach(() => {
  // Reset id sequence so tests are deterministic.
  _resetFootnoteSeq()
  editor = new Editor({
    extensions: baseExtensions,
    content: '<p>hello world</p>',
  })
})

afterEach(() => {
  editor.destroy()
})

describe('insertFootnote command', () => {
  it('creates a footnoteRef node in the document', () => {
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson
    const ref = findNode(doc, 'footnoteRef')
    expect(ref).toBeDefined()
    expect(typeof ref?.attrs?.id).toBe('string')
    expect((ref?.attrs?.id as string).length).toBeGreaterThan(0)
  })

  it('creates a footnotes block with a matching footnoteItem', () => {
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson

    const ref = findNode(doc, 'footnoteRef')
    const block = findNode(doc, 'footnotes')
    const item = findNode(doc, 'footnoteItem')

    expect(block).toBeDefined()
    expect(item).toBeDefined()
    expect(ref?.attrs?.id).toBe(item?.attrs?.id)
  })

  it('second insertFootnote yields refs numbered 1 and 2 in document order', () => {
    editor.commands.insertFootnote()
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson

    const refs = findAllNodes(doc, 'footnoteRef')
    expect(refs).toHaveLength(2)

    // After the numbering plugin runs, numbers should be 1 and 2.
    const numbers = refs.map((r) => r.attrs?.number as number)
    expect(numbers).toContain(1)
    expect(numbers).toContain(2)
  })

  it('creates two footnoteItems with distinct ids', () => {
    editor.commands.insertFootnote()
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson

    const items = findAllNodes(doc, 'footnoteItem')
    expect(items).toHaveLength(2)
    const ids = items.map((i) => i.attrs?.id as string)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('inserting into an existing footnotes block does not create a second block', () => {
    editor.commands.insertFootnote()
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson
    const blocks = findAllNodes(doc, 'footnotes')
    expect(blocks).toHaveLength(1)
  })
})

describe('markdown serialization (B8)', () => {
  it('serializes a footnoteRef as [^N]', () => {
    editor.commands.insertFootnote()
    const doc = editor.getJSON()
    const md = serializeMarkdown(doc)
    expect(md).toContain('[^1]')
  })

  it('serializes the footnotes block with [^N]: definition', () => {
    editor.commands.insertFootnote()
    const doc = editor.getJSON()
    const md = serializeMarkdown(doc)
    expect(md).toContain('[^1]:')
  })

  it('round-trip: two refs produce [^1] and [^2] markers', () => {
    editor.commands.insertFootnote()
    editor.commands.insertFootnote()
    const doc = editor.getJSON()
    const md = serializeMarkdown(doc)
    expect(md).toContain('[^1]')
    expect(md).toContain('[^2]')
    expect(md).toContain('[^1]:')
    expect(md).toContain('[^2]:')
  })
})

describe('placement attr', () => {
  it('defaults to endnote', () => {
    editor.commands.insertFootnote()
    const doc = editor.getJSON() as DocJson
    const ref = findNode(doc, 'footnoteRef')
    expect(ref?.attrs?.placement).toBe('endnote')
  })

  it('accepts footnote placement', () => {
    editor.commands.insertFootnote({ placement: 'footnote' })
    const doc = editor.getJSON() as DocJson
    const ref = findNode(doc, 'footnoteRef')
    expect(ref?.attrs?.placement).toBe('footnote')
  })
})
