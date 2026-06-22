// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { collectCrossRefTargets, indexTargets } from '@/lib/editor/cross-ref'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

/**
 * Regression test for the JSON-vs-PMNode bug: collectCrossRefTargets must work
 * on a REAL ProseMirror doc, where `node.type` is a NodeType OBJECT (not a
 * string). The pure cross-ref.test.ts only exercises plain-JSON docs (string
 * type), so it passed while the live editor numbering map stayed empty and every
 * cross-reference rendered "(?)". This builds a real editor and asserts targets
 * resolve from `editor.state.doc`.
 */
describe('collectCrossRefTargets — real ProseMirror doc (PMNode path)', () => {
  it('numbers figures from a live editor doc', () => {
    const editor = new Editor({
      extensions: baseExtensions,
      content: {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'a.png', alt: 'a', caption: 'First', refId: 'fig-aaa' } },
          { type: 'image', attrs: { src: 'b.png', alt: 'b', caption: 'Second', refId: 'fig-bbb' } },
          { type: 'paragraph' },
        ],
      },
    })

    const targets = collectCrossRefTargets(editor.state.doc)
    const figures = targets.filter((t) => t.kind === 'figure')

    expect(figures).toHaveLength(2)
    expect(figures[0]?.refId).toBe('fig-aaa')
    expect(figures[0]?.label).toBe('Figure 1')
    expect(figures[1]?.refId).toBe('fig-bbb')
    expect(figures[1]?.label).toBe('Figure 2')

    const index = indexTargets(targets)
    expect(index.get('fig-bbb')?.number).toBe(2)

    editor.destroy()
  })
})
