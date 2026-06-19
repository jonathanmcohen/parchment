// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// ── helpers ────────────────────────────────────────────────────────────────

type MarkEntry = { type: string; attrs?: Record<string, unknown> }
type TextNode = { type: string; text?: string; marks?: MarkEntry[] }
type ContentNode = { type: string; content?: Array<TextNode | ContentNode> }
type DocJson = { type: string; content?: Array<TextNode | ContentNode> }

function collectMarks(json: DocJson): MarkEntry[] {
  const marks: MarkEntry[] = []
  const walk = (node: ContentNode | TextNode) => {
    if ('marks' in node && Array.isArray(node.marks)) marks.push(...(node.marks as MarkEntry[]))
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content as Array<ContentNode | TextNode>) walk(child)
    }
  }
  walk(json as ContentNode)
  return marks
}

function collectText(json: DocJson): string {
  let text = ''
  const walk = (node: ContentNode | TextNode) => {
    if ('text' in node && typeof node.text === 'string') text += node.text
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content as Array<ContentNode | TextNode>) walk(child)
    }
  }
  walk(json as ContentNode)
  return text
}

// ── tests ──────────────────────────────────────────────────────────────────

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

describe('D2 Suggesting extension', () => {
  it('toggleSuggesting updates storage.enabled', () => {
    expect(editor.storage.suggesting.enabled).toBe(false)
    editor.commands.toggleSuggesting()
    expect(editor.storage.suggesting.enabled).toBe(true)
    editor.commands.toggleSuggesting()
    expect(editor.storage.suggesting.enabled).toBe(false)
  })

  it('setSuggesting(true) enables suggesting mode', () => {
    editor.commands.setSuggesting(true)
    expect(editor.storage.suggesting.enabled).toBe(true)
  })

  it('typed text carries insertion mark when suggesting is ON', () => {
    editor.commands.setSuggesting(true)

    // Move to end of paragraph, then insert text
    editor.commands.selectAll()
    const { to } = editor.state.selection
    // Set cursor at end of text
    editor
      .chain()
      .setTextSelection(to - 1) // before closing paragraph boundary
      .insertContent(' world')
      .run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'insertion')).toBe(true)
  })

  it('acceptAllChanges keeps insertion text and removes insertion marks', () => {
    editor.commands.setSuggesting(true)

    // Insert some text
    editor
      .chain()
      .setTextSelection(6) // after 'hello'
      .insertContent(' added')
      .run()

    // Verify insertion mark is present
    let marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'insertion')).toBe(true)

    // Accept all
    editor.commands.acceptAllChanges()

    marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'insertion')).toBe(false)

    // Text is still present
    const text = collectText(editor.getJSON() as DocJson)
    expect(text).toContain('added')
  })

  it('rejectAllChanges removes insertion text entirely', () => {
    editor.commands.setSuggesting(true)

    editor.chain().setTextSelection(6).insertContent(' added').run()

    const textBefore = collectText(editor.getJSON() as DocJson)
    expect(textBefore).toContain('added')

    editor.commands.rejectAllChanges()

    const textAfter = collectText(editor.getJSON() as DocJson)
    expect(textAfter).not.toContain('added')
    // Original text still present
    expect(textAfter).toContain('hello')
  })

  it('acceptAllChanges on deletion mark removes the text', () => {
    // Manually apply a deletion mark to simulate what the keydown handler does
    const { state } = editor
    const schema = state.schema
    const deletionMarkType = schema.marks.deletion
    expect(deletionMarkType).toBeDefined()

    // Apply deletion mark to "hello" (positions 1-6 in a doc with one paragraph)
    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch && deletionMarkType) {
        tr.addMark(1, 6, deletionMarkType.create({ author: 'You', color: '#be123c' }))
        dispatch(tr)
      }
      return true
    })

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'deletion')).toBe(true)

    // Accept: deletion text is removed
    editor.commands.acceptAllChanges()

    const text = collectText(editor.getJSON() as DocJson)
    expect(text).not.toContain('hello')
  })

  it('rejectAllChanges on deletion mark keeps text and removes mark', () => {
    const { state } = editor
    const schema = state.schema
    const deletionMarkType = schema.marks.deletion

    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch && deletionMarkType) {
        tr.addMark(1, 6, deletionMarkType.create({ author: 'You', color: '#be123c' }))
        dispatch(tr)
      }
      return true
    })

    editor.commands.rejectAllChanges()

    const text = collectText(editor.getJSON() as DocJson)
    expect(text).toContain('hello')

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'deletion')).toBe(false)
  })

  it('acceptChange / rejectChange work for a single range', () => {
    // Apply insertion mark to positions 1-6 ("hello")
    const insertionMarkType = editor.state.schema.marks.insertion
    expect(insertionMarkType).toBeDefined()

    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch && insertionMarkType) {
        tr.addMark(1, 6, insertionMarkType.create({ author: 'You', color: '#1d4ed8' }))
        dispatch(tr)
      }
      return true
    })

    // Reject: removes the text
    editor.commands.rejectChange(1, 6, 'insertion')
    const text = collectText(editor.getJSON() as DocJson)
    expect(text).not.toContain('hello')
  })

  it('no insertion mark appears when suggesting is OFF', () => {
    // suggesting is OFF by default
    editor.chain().setTextSelection(6).insertContent(' world').run()

    const marks = collectMarks(editor.getJSON() as DocJson)
    expect(marks.some((m) => m.type === 'insertion')).toBe(false)
  })
})
