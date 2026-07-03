// @vitest-environment jsdom
/**
 * v0.2.10 — SmartPaste extension behavior tests (headless Tiptap editor).
 *
 * Covers the extension-level spec items:
 *  - transformPastedHTML normalizes foreign HTML,
 *  - but is SKIPPED when the caret is inside a code block (raw text belongs
 *    there),
 *  - and is SKIPPED for internal ProseMirror clipboard HTML (data-pm-slice),
 *  - Mod+Shift+V → paste-without-formatting command (plain paragraphs, double
 *    newlines split blocks, single newlines become hard breaks, marks stripped),
 *  - the Mod-Shift-v keyboard shortcut is bound by this extension.
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SmartPasteExtension } from '@/lib/editor/extensions/smart-paste'

const extensions = [StarterKit.configure({ undoRedo: false }), SmartPasteExtension]

let editor: Editor

beforeEach(() => {
  editor = new Editor({ extensions, content: '<p>start</p>' })
})

afterEach(() => {
  editor.destroy()
})

/** Grab the composed editor-level transformPastedHTML from the live view. */
function composedTransform(): (html: string) => string {
  const fn = editor.view.someProp('transformPastedHTML') as
    | ((html: string, view?: unknown) => string)
    | undefined
  if (!fn) throw new Error('no composed transformPastedHTML on the view')
  return (html: string) => fn(html, editor.view)
}

describe('SmartPaste transformPastedHTML (composed on the view)', () => {
  it('normalizes foreign Word HTML when NOT in a code block', () => {
    // caret is in a normal paragraph
    const wordHtml = '<p class="MsoNormal" style="mso-x:1;color:red">Hi</p>'
    const out = composedTransform()(wordHtml)
    expect(out).not.toMatch(/mso-/i)
    expect(out).not.toMatch(/MsoNormal/)
    expect(out).not.toMatch(/color\s*:/i)
    expect(out).toContain('Hi')
  })

  it('passes internal ProseMirror clipboard HTML (data-pm-slice) through unchanged', () => {
    const pm = '<p data-pm-slice="1 1 []">Hi <span style="color:red">world</span></p>'
    expect(composedTransform()(pm)).toBe(pm)
  })

  it('does NOT transform HTML when the caret is inside a code block (raw paste)', () => {
    // Put the caret inside a code block.
    editor.commands.setContent('<pre><code>code here</code></pre>')
    editor.commands.selectAll()
    editor.commands.setTextSelection(2) // inside the code block text
    expect(editor.isActive('codeBlock')).toBe(true)

    const wordHtml = '<p class="MsoNormal" style="mso-x:1">raw &lt;html&gt; kept</p>'
    // In a code block the pasted HTML must be returned verbatim so the raw text
    // (angle brackets, tags) survives — no normalization, no unwrapping.
    expect(composedTransform()(wordHtml)).toBe(wordHtml)
  })
})

describe('SmartPaste — paste without formatting command (Mod+Shift+V backing)', () => {
  it('exposes a pastePlainText command that inserts bare paragraphs', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.focus()
    const ran = editor.commands.pastePlainText('hello world')
    expect(ran).toBe(true)
    expect(editor.getText()).toContain('hello world')
  })

  it('splits double newlines into separate paragraphs', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.pastePlainText('para one\n\npara two')
    type LooseNode = { type?: string; text?: string; content?: LooseNode[] }
    const json = editor.getJSON() as LooseNode
    const paras = (json.content ?? []).filter((n) => n.type === 'paragraph')
    // At least two paragraphs carry the two blocks.
    const texts = paras.map((p) => (p.content ?? []).map((c) => c.text ?? '').join(''))
    expect(texts.some((t) => t.includes('para one'))).toBe(true)
    expect(texts.some((t) => t.includes('para two'))).toBe(true)
    // They must be in DIFFERENT paragraph nodes.
    const idxOne = texts.findIndex((t) => t.includes('para one'))
    const idxTwo = texts.findIndex((t) => t.includes('para two'))
    expect(idxOne).not.toBe(idxTwo)
  })

  it('turns single newlines within a block into hard breaks', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.pastePlainText('line one\nline two')
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('hardBreak')
  })

  it('strips all formatting — even if the text looks like markdown/HTML it stays literal', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.pastePlainText('**not bold** and <b>literal</b>')
    // No strong mark should be produced; the literal characters survive as text.
    const json = JSON.stringify(editor.getJSON())
    expect(json).not.toContain('"type":"bold"')
    expect(editor.getText()).toContain('**not bold**')
    expect(editor.getText()).toContain('<b>literal</b>')
  })
})

describe('SmartPaste — Mod-Shift-v keyboard binding', () => {
  it('binds Mod-Shift-v', () => {
    // The extension must own the Mod-Shift-v shortcut.
    const shortcuts = SmartPasteExtension.config.addKeyboardShortcuts
    expect(typeof shortcuts).toBe('function')
    // Call it in the extension's `this` context to read the returned keymap.
    const map = (
      shortcuts as (this: { editor: Editor; options: unknown; storage: unknown }) => Record<
        string,
        unknown
      >
    ).call({ editor, options: {}, storage: {} })
    const keys = Object.keys(map).map((k) => k.toLowerCase())
    expect(keys).toContain('mod-shift-v')
  })
})
