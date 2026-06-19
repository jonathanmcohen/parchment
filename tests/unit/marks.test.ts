// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

type MarkEntry = { type: string; attrs?: Record<string, unknown> }
type TextNode = { type: string; text?: string; marks?: MarkEntry[] }
type ContentNode = { type: string; content?: TextNode[] }
type DocJson = { type: string; content?: ContentNode[] }

/** Collect all mark types present anywhere in the doc JSON. */
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
    content: '<p>hello</p>',
  })
})

afterEach(() => {
  editor.destroy()
})

describe('B2 inline marks via baseExtensions', () => {
  it('toggleUnderline — applies underline mark', () => {
    editor.commands.selectAll()
    editor.commands.toggleUnderline()

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'underline')).toBe(true)
    expect(editor.isActive('underline')).toBe(true)
  })

  it('toggleHighlight — applies highlight mark', () => {
    editor.commands.selectAll()
    editor.commands.toggleHighlight()

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'highlight')).toBe(true)
    expect(editor.isActive('highlight')).toBe(true)
  })

  it('setColor — applies textStyle mark with color attr', () => {
    editor.commands.selectAll()
    editor.chain().setColor('#ff0000').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const ts = marks.find((m) => m.type === 'textStyle')
    expect(ts).toBeDefined()
    expect(ts?.attrs?.color).toBe('#ff0000')
  })

  it('setFontFamily — applies textStyle mark with fontFamily attr', () => {
    editor.commands.selectAll()
    editor.chain().setFontFamily('serif').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const ts = marks.find((m) => m.type === 'textStyle' && m.attrs?.fontFamily)
    expect(ts).toBeDefined()
    expect(ts?.attrs?.fontFamily).toBe('serif')
  })

  it('setFontSize — applies textStyle mark with fontSize attr', () => {
    editor.commands.selectAll()
    editor.chain().setFontSize('14pt').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const ts = marks.find((m) => m.type === 'textStyle' && m.attrs?.fontSize)
    expect(ts).toBeDefined()
    expect(ts?.attrs?.fontSize).toBe('14pt')
  })

  it('setLetterSpacing — applies textStyle mark with letterSpacing attr', () => {
    editor.commands.selectAll()
    editor.chain().setLetterSpacing('0.05em').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const ts = marks.find((m) => m.type === 'textStyle' && m.attrs?.letterSpacing)
    expect(ts).toBeDefined()
    expect(ts?.attrs?.letterSpacing).toBe('0.05em')
  })

  it('setLineHeight — applies textStyle mark with lineHeight attr', () => {
    editor.commands.selectAll()
    editor.chain().setLineHeight('1.5').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    const ts = marks.find((m) => m.type === 'textStyle' && m.attrs?.lineHeight)
    expect(ts).toBeDefined()
    expect(ts?.attrs?.lineHeight).toBe('1.5')
  })

  it('can() reflects capability — toggleBold', () => {
    editor.commands.selectAll()
    expect(editor.can().toggleBold()).toBe(true)
    editor.commands.toggleBold()
    expect(editor.isActive('bold')).toBe(true)
  })

  it('can() reflects capability — toggleUnderline', () => {
    editor.commands.selectAll()
    expect(editor.can().toggleUnderline()).toBe(true)
  })

  it('isActive resets after untoggling highlight', () => {
    editor.commands.selectAll()
    editor.commands.toggleHighlight()
    expect(editor.isActive('highlight')).toBe(true)
    editor.commands.toggleHighlight()
    expect(editor.isActive('highlight')).toBe(false)
  })
})
