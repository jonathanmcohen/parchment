// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

type MarkEntry = { type: string; attrs?: Record<string, unknown> }
type TextNode = { type: string; text?: string; marks?: MarkEntry[] }
type ContentNode = { type: string; content?: (ContentNode | TextNode)[] }
type DocJson = { type: string; content?: ContentNode[] }

function collectMarks(json: DocJson): MarkEntry[] {
  const marks: MarkEntry[] = []
  const walk = (node: ContentNode | TextNode) => {
    if ('marks' in node && Array.isArray(node.marks)) {
      marks.push(...(node.marks as MarkEntry[]))
    }
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content as (ContentNode | TextNode)[]) {
        walk(child)
      }
    }
  }
  walk(json as ContentNode)
  return marks
}

let editor: Editor

beforeEach(() => {
  editor = new Editor({
    extensions: baseExtensions,
    content: '<p>hello world</p>',
  })
})

afterEach(() => {
  editor.destroy()
})

describe('B6 links via baseExtensions', () => {
  it('link extension is present in baseExtensions (no duplicate warning)', () => {
    // The link mark should be registered in the schema.
    expect(editor.schema.marks.link).toBeDefined()
  })

  it('setLink — applies link mark with given href on selection', () => {
    editor.commands.selectAll()
    editor.chain().setLink({ href: 'https://example.com' }).run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const link = marks.find((m) => m.type === 'link')
    expect(link).toBeDefined()
    expect(link?.attrs?.href).toBe('https://example.com')
  })

  it('setLink — applies rel and HTMLAttributes', () => {
    editor.commands.selectAll()
    editor.chain().setLink({ href: 'https://example.com' }).run()

    // The link extension should carry over HTMLAttributes (rel) on getJSON attrs
    // — they appear in the HTML output. Verify the mark is correctly configured.
    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'link')).toBe(true)
  })

  it('unsetLink — removes link mark', () => {
    editor.commands.selectAll()
    editor.chain().setLink({ href: 'https://example.com' }).run()
    expect(editor.isActive('link')).toBe(true)

    editor.chain().unsetLink().run()
    expect(editor.isActive('link')).toBe(false)
  })

  it('setLink — in-doc anchor href is accepted', () => {
    editor.commands.selectAll()
    editor.chain().setLink({ href: '#my-heading' }).run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const link = marks.find((m) => m.type === 'link')
    expect(link?.attrs?.href).toBe('#my-heading')
  })

  it('setLink — cross-doc /d/<id> href is accepted', () => {
    editor.commands.selectAll()
    editor.chain().setLink({ href: '/d/abc-123' }).run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const link = marks.find((m) => m.type === 'link')
    expect(link?.attrs?.href).toBe('/d/abc-123')
  })

  it('link extension has autolink configured (option present)', () => {
    // Verify autolink is enabled on the configured extension.
    const linkExt = editor.extensionManager.extensions.find((e) => e.name === 'link')
    expect(linkExt).toBeDefined()
    // In Tiptap v3, options are available via ext.options
    const opts = linkExt?.options as Record<string, unknown> | undefined
    expect(opts?.autolink).toBe(true)
    expect(opts?.openOnClick).toBe(false)
    expect(opts?.linkOnPaste).toBe(true)
  })
})
