// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// v0.2.10 table UX — verify the UPSTREAM keyboard defaults are wired (we do not
// fight them; we document them). @tiptap/extension-table maps:
//   • Tab        → goToNextCell; at the last cell → addRowAfter + move on.
//   • Shift-Tab  → goToPreviousCell.
// These assert the COMMANDS exist and behave, which is what the keymap invokes.

type AnyNode = { type: string; content?: AnyNode[] }
function countRows(root: AnyNode): number {
  let n = root.type === 'tableRow' ? 1 : 0
  for (const c of root.content ?? []) n += countRows(c)
  return n
}

let editor: Editor
beforeEach(() => {
  editor = new Editor({ extensions: baseExtensions, content: '<p>x</p>' })
  editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()
})
afterEach(() => editor.destroy())

describe('table keyboard commands (upstream defaults)', () => {
  it('goToNextCell / goToPreviousCell move the selection', () => {
    // Place cursor in the first cell.
    let firstCell = -1
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'tableCell' && firstCell < 0) firstCell = p + 2
    })
    editor.commands.setTextSelection(firstCell)
    const before = editor.state.selection.from
    const moved = editor.commands.goToNextCell()
    expect(moved).toBe(true)
    expect(editor.state.selection.from).not.toBe(before)
    // And back.
    expect(editor.commands.goToPreviousCell()).toBe(true)
  })

  it('addRowAfter grows the table — the Tab-at-last-cell behaviour', () => {
    // Move to the very last cell.
    let lastCell = -1
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'tableCell') lastCell = p + 2
    })
    editor.commands.setTextSelection(lastCell)
    const rowsBefore = countRows(editor.getJSON() as AnyNode)
    // The keymap's Tab-at-end does exactly this chain.
    const ok = editor.chain().focus().addRowAfter().goToNextCell().run()
    expect(ok).toBe(true)
    expect(countRows(editor.getJSON() as AnyNode)).toBe(rowsBefore + 1)
  })
})
