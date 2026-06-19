// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// Regression: HeadingId must register `id` as a schema attribute so it both
// persists and renders to the DOM `<h2 id="...">` (the anchor for B6
// link-to-heading). A JSON-only collectHeadings test does not catch a missing
// global attribute.
describe('HeadingId rendering', () => {
  it('renders a slugged id attribute on heading elements', () => {
    const editor = new Editor({
      extensions: baseExtensions,
      content: '<h2>Getting Started Guide</h2>',
    })
    // appendTransaction sets the id on the next tick; force a no-op tx.
    editor.commands.setTextSelection(1)
    const html = editor.getHTML()
    expect(html).toContain('id="getting-started-guide"')
    editor.destroy()
  })

  it('de-duplicates ids for repeated heading text', () => {
    const editor = new Editor({
      extensions: baseExtensions,
      content: '<h2>Notes</h2><p>x</p><h2>Notes</h2>',
    })
    editor.commands.setTextSelection(1)
    const html = editor.getHTML()
    expect(html).toContain('id="notes"')
    expect(html).toContain('id="notes-2"')
    editor.destroy()
  })
})
