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

/** Walk the JSON tree and find the first node of a given type. */
function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const found = findNode(child, type)
    if (found) return found
  }
  return undefined
}

/** Count all nodes of a given type in the tree. */
function countNodes(root: AnyNode, type: string): number {
  let count = root.type === type ? 1 : 0
  for (const child of root.content ?? []) {
    count += countNodes(child, type)
  }
  return count
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

describe('B4 table integration via baseExtensions', () => {
  it('insertTable creates a table node in the doc', () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    const doc = editor.getJSON() as DocJson
    const tableNode = findNode(doc, 'table')
    expect(tableNode).toBeDefined()
    expect(tableNode?.type).toBe('table')
  })

  it('insertTable 3x3 with header → 3 rows total', () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    const doc = editor.getJSON() as DocJson
    expect(countNodes(doc, 'tableRow')).toBe(3)
  })

  it('insertTable with header row → first row contains tableHeader cells', () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    const doc = editor.getJSON() as DocJson
    const tableNode = findNode(doc, 'table')
    const firstRow = tableNode?.content?.[0]
    expect(firstRow?.type).toBe('tableRow')
    // Header row contains tableHeader nodes
    const firstCell = firstRow?.content?.[0]
    expect(firstCell?.type).toBe('tableHeader')
  })

  it('addRowAfter increases tableRow count', () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    // Move cursor into the table so commands work
    const doc1 = editor.getJSON() as DocJson
    const rowsBefore = countNodes(doc1, 'tableRow')
    editor.chain().focus().addRowAfter().run()
    const doc2 = editor.getJSON() as DocJson
    const rowsAfter = countNodes(doc2, 'tableRow')
    expect(rowsAfter).toBe(rowsBefore + 1)
  })

  it('toggleHeaderRow — after two toggles, header state is back to original', () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    const doc0 = editor.getJSON() as DocJson
    const headersBefore = countNodes(doc0, 'tableHeader')

    editor.chain().focus().toggleHeaderRow().run()
    editor.chain().focus().toggleHeaderRow().run()

    const doc2 = editor.getJSON() as DocJson
    const headersAfter = countNodes(doc2, 'tableHeader')
    expect(headersAfter).toBe(headersBefore)
  })

  it('deleteTable removes the table node', () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()
    editor.chain().focus().deleteTable().run()
    const doc = editor.getJSON() as DocJson
    expect(findNode(doc, 'table')).toBeUndefined()
  })
})
