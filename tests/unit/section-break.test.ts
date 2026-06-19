// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

type FoundSection = { pos: number; attrs: Record<string, unknown> }

function findSectionBreak(editor: Editor): FoundSection | null {
  let found: FoundSection | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'sectionBreak' && found === null) {
      found = { pos, attrs: node.attrs as Record<string, unknown> }
      return false
    }
    return true
  })
  return found
}

describe('B13 — section break edit', () => {
  it('insertSectionBreak creates a node with default attrs', () => {
    const editor = new Editor({ extensions: baseExtensions, content: '<p>x</p>' })
    editor.commands.insertSectionBreak()
    const sb = findSectionBreak(editor)
    expect(sb).not.toBeNull()
    expect(sb?.attrs.pageNumberFormat).toBe('1')
    expect(sb?.attrs.pageNumberPosition).toBe('center')
    editor.destroy()
  })

  it('edits the exact node via setNodeMarkup (the dialog Apply path)', () => {
    const editor = new Editor({ extensions: baseExtensions, content: '<p>x</p>' })
    editor.commands.insertSectionBreak()
    const sb = findSectionBreak(editor)
    expect(sb).not.toBeNull()
    if (!sb) return

    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setNodeMarkup(sb.pos, undefined, {
          ...sb.attrs,
          headerText: 'Chapter 1',
          footerText: 'Confidential',
          pageNumberFormat: 'i',
          pageNumberPosition: 'left',
        })
      }
      return true
    })

    const after = findSectionBreak(editor)
    expect(after?.attrs.headerText).toBe('Chapter 1')
    expect(after?.attrs.footerText).toBe('Confidential')
    expect(after?.attrs.pageNumberFormat).toBe('i')
    expect(after?.attrs.pageNumberPosition).toBe('left')
    editor.destroy()
  })
})
