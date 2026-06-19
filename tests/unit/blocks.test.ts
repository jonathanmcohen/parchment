// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

type AnyNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: AnyNode[]
}
type DocJson = AnyNode

/** Return the first-level content node (first block under the doc). */
function topNode(editor: Editor): AnyNode {
  const doc = editor.getJSON() as DocJson
  const first = doc.content?.[0]
  if (!first) throw new Error('doc has no content')
  return first
}

/** Walk the JSON tree and find the first node of a given type. */
function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const found = findNode(child, type)
    if (found) return found
  }
  return undefined
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

describe('B3 block formatting via baseExtensions', () => {
  it('toggleHeading level 1 — converts paragraph to heading level 1', () => {
    editor.commands.selectAll()
    editor.commands.toggleHeading({ level: 1 })
    const top = topNode(editor)
    expect(top.type).toBe('heading')
    expect(top.attrs?.level).toBe(1)
  })

  it('toggleHeading level 6 — converts paragraph to heading level 6', () => {
    editor.commands.selectAll()
    editor.commands.toggleHeading({ level: 6 })
    const top = topNode(editor)
    expect(top.type).toBe('heading')
    expect(top.attrs?.level).toBe(6)
  })

  it('toggleBlockquote — wraps paragraph in blockquote', () => {
    editor.commands.selectAll()
    editor.commands.toggleBlockquote()
    const top = topNode(editor)
    expect(top.type).toBe('blockquote')
    // The paragraph should be nested inside
    const inner = top.content?.[0]
    expect(inner?.type).toBe('paragraph')
  })

  it('toggleBulletList — converts paragraph to bulletList', () => {
    editor.commands.selectAll()
    editor.commands.toggleBulletList()
    const top = topNode(editor)
    expect(top.type).toBe('bulletList')
  })

  it('toggleOrderedList — converts paragraph to orderedList', () => {
    editor.commands.selectAll()
    editor.commands.toggleOrderedList()
    const top = topNode(editor)
    expect(top.type).toBe('orderedList')
  })

  it('toggleTaskList — converts paragraph to taskList with taskItem', () => {
    editor.commands.selectAll()
    editor.commands.toggleTaskList()
    const top = topNode(editor)
    expect(top.type).toBe('taskList')
    const item = top.content?.[0]
    expect(item?.type).toBe('taskItem')
  })

  it('toggleCodeBlock then updateAttributes — stores language attr', () => {
    editor.commands.selectAll()
    editor.commands.toggleCodeBlock()
    editor.chain().updateAttributes('codeBlock', { language: 'ts' }).run()
    const top = topNode(editor)
    expect(top.type).toBe('codeBlock')
    expect(top.attrs?.language).toBe('ts')
  })

  it('setTextAlign center — paragraph gets textAlign center', () => {
    editor.commands.selectAll()
    editor.chain().setTextAlign('center').run()
    const top = topNode(editor)
    expect(top.type).toBe('paragraph')
    expect(top.attrs?.textAlign).toBe('center')
  })

  it('toggleFirstLineIndent — paragraph gets firstLineIndent attribute', () => {
    editor.commands.selectAll()
    editor.commands.toggleFirstLineIndent()
    const doc = editor.getJSON() as DocJson
    const para = findNode(doc, 'paragraph')
    expect(para).toBeDefined()
    expect(para?.attrs?.firstLineIndent).toBeTruthy()
  })

  it('toggleFirstLineIndent twice — removes the indent attribute', () => {
    editor.commands.selectAll()
    editor.commands.toggleFirstLineIndent()
    editor.commands.toggleFirstLineIndent()
    const doc = editor.getJSON() as DocJson
    const para = findNode(doc, 'paragraph')
    expect(para?.attrs?.firstLineIndent).toBeFalsy()
  })

  it('toggleHeading level 2 — JSON reflects correct level', () => {
    editor.commands.selectAll()
    editor.commands.toggleHeading({ level: 2 })
    const top = topNode(editor)
    expect(top.type).toBe('heading')
    expect(top.attrs?.level).toBe(2)
    // Level 3 is not active — confirm by checking JSON
    const topAttrs = top.attrs ?? {}
    expect(topAttrs.level).not.toBe(3)
  })

  it('toggleTaskList — JSON shows taskList top node', () => {
    editor.commands.selectAll()
    editor.commands.toggleTaskList()
    const top = topNode(editor)
    expect(top.type).toBe('taskList')
    const item = top.content?.[0]
    expect(item?.type).toBe('taskItem')
  })

  it('setTextAlign right — JSON textAlign attr is right', () => {
    editor.commands.selectAll()
    editor.chain().setTextAlign('right').run()
    const top = topNode(editor)
    expect(top.attrs?.textAlign).toBe('right')
    expect(top.attrs?.textAlign).not.toBe('center')
  })
})
