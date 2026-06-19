// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { findSelectedTable } from '@/lib/editor/table-utils'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

const TABLE =
  '<table><tbody><tr><td><p>x</p></td><td><p>y</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>'

function makeEditor(html: string): Editor {
  return new Editor({ extensions: baseExtensions, content: html })
}

function tablePositions(editor: Editor): number[] {
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') positions.push(pos)
  })
  return positions
}

describe('findSelectedTable', () => {
  it('returns null when the selection is outside any table', () => {
    const editor = makeEditor('<p>hello</p>')
    editor.commands.setTextSelection(2)
    expect(findSelectedTable(editor.state)).toBeNull()
    editor.destroy()
  })

  it('returns the table containing the selection — the SECOND, not the first', () => {
    const editor = makeEditor(`<p>before</p>${TABLE}<p>between</p>${TABLE}<p>after</p>`)
    const positions = tablePositions(editor)
    expect(positions.length).toBe(2)
    const secondTablePos = positions[1] as number

    // Put the cursor a few tokens into the second table.
    editor.commands.setTextSelection(secondTablePos + 5)
    const found = findSelectedTable(editor.state)

    expect(found).not.toBeNull()
    expect(found?.pos).toBe(secondTablePos)
    editor.destroy()
  })
})
