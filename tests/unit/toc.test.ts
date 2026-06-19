// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectHeadings } from '@/lib/editor/headings'
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

describe('B7 toc node via baseExtensions', () => {
  it('insertToc() inserts a toc node into the document', () => {
    editor.commands.insertToc()
    const doc = editor.getJSON() as DocJson
    const toc = findNode(doc, 'toc')
    expect(toc).toBeDefined()
    expect(toc?.type).toBe('toc')
  })

  it('toc node has showPageNumbers attr defaulting to false', () => {
    editor.commands.insertToc()
    const doc = editor.getJSON() as DocJson
    const toc = findNode(doc, 'toc')
    expect(toc?.attrs?.showPageNumbers).toBe(false)
  })

  it('updateAttributes showPageNumbers toggles the attr to true', () => {
    editor.commands.insertToc()
    // Find the toc node position and update it
    let tocPos: number | undefined
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'toc') {
        tocPos = pos
        return false
      }
      return true
    })
    expect(tocPos).toBeDefined()
    editor.commands.command(({ tr }) => {
      if (tocPos === undefined) return false
      tr.setNodeMarkup(tocPos, undefined, { showPageNumbers: true })
      return true
    })
    const doc2 = editor.getJSON() as DocJson
    const toc2 = findNode(doc2, 'toc')
    expect(toc2?.attrs?.showPageNumbers).toBe(true)
  })

  it('collectHeadings returns headings from a doc with multiple heading levels', () => {
    editor.commands.setContent(
      '<h1>Introduction</h1><h2>Background</h2><h3>Details</h3><p>text</p>',
    )
    const headings = collectHeadings(editor.getJSON())
    expect(headings).toHaveLength(3)
    expect(headings[0]).toMatchObject({ level: 1, text: 'Introduction' })
    expect(headings[1]).toMatchObject({ level: 2, text: 'Background' })
    expect(headings[2]).toMatchObject({ level: 3, text: 'Details' })
  })

  it('collectHeadings returns entries in document order', () => {
    editor.commands.setContent('<h2>Section A</h2><h1>Title</h1><h3>Sub</h3>')
    const headings = collectHeadings(editor.getJSON())
    expect(headings.map((h) => h.text)).toEqual(['Section A', 'Title', 'Sub'])
  })

  it('toc node can coexist with headings in the same document', () => {
    editor.commands.setContent('<h1>My Heading</h1><p>some text</p>')
    editor.commands.insertToc()
    const doc = editor.getJSON() as DocJson
    const toc = findNode(doc, 'toc')
    expect(toc).toBeDefined()
    const headings = collectHeadings(doc)
    expect(headings).toHaveLength(1)
    expect(headings[0]?.text).toBe('My Heading')
  })
})
