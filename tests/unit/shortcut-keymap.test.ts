// @vitest-environment jsdom
//
// v0.2.10 — user-friendly keyboard shortcuts. These tests exercise the
// ShortcutKeymap extension end-to-end against a REAL headless Tiptap editor
// built from the actual baseExtensions set, so:
//   1. the block command primitives (move up/down, duplicate, normal text)
//      behave and skip gracefully at document boundaries, and
//   2. the KEY BINDINGS actually win over the StarterKit defaults they must
//      override — a `Mod-Enter` keydown must produce a `pageBreak` node, NOT a
//      hardBreak. That guarantee cannot be verified by calling the command
//      directly; we route a synthesized keydown through ProseMirror's own
//      `handleKeyDown` prop, which runs the full keymap-plugin stack
//      first-match-wins exactly as a real browser keydown does.
//
// jsdom NOTES:
//  - navigator.platform is '' → prosemirror-keymap resolves `Mod` to CTRL, so
//    keydown tests use ctrlKey (not metaKey) to represent Mod.
//  - prosemirror-keymap matches letter combos against the LOWERCASE event.key.
//  - A doc that would otherwise end in a heading gets a trailing empty paragraph
//    auto-filled by the editor (true of plain StarterKit too). Block-order
//    assertions therefore compare the NON-EMPTY block texts.

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import { makeShortcutKeymap, ShortcutKeymap } from '@/lib/editor/extensions/shortcut-keymap'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// ── Helpers ────────────────────────────────────────────────────────────────

type AnyNode = { type: string; attrs?: Record<string, unknown>; content?: AnyNode[]; text?: string }

function docContent(editor: Editor): AnyNode[] {
  return (editor.getJSON() as AnyNode).content ?? []
}

/** Top-level block types in document order. */
function topTypes(editor: Editor): string[] {
  return docContent(editor).map((n) => n.type)
}

/** Text of every top-level block in order. */
function topTexts(editor: Editor): string[] {
  return docContent(editor).map((n) => n.content?.map((c) => c.text ?? '').join('') ?? '')
}

/**
 * Non-empty top-level block texts, in order. Used for order assertions so the
 * editor's trailing-empty-paragraph auto-fill (present with plain StarterKit
 * too) does not make the expectation brittle.
 */
function nonEmptyTexts(editor: Editor): string[] {
  return topTexts(editor).filter((t) => t.length > 0)
}

/** Count nodes of a given type anywhere in the doc. */
function countNodes(editor: Editor, type: string): number {
  let n = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) n++
  })
  return n
}

/** Put the cursor inside the Nth (0-based) top-level block. */
function cursorInBlock(editor: Editor, index: number): void {
  let pos = 0
  const doc = editor.state.doc
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  editor.commands.setTextSelection(pos + 1)
}

/**
 * Route a keydown through ProseMirror's registered `handleKeyDown` prop — the
 * same keymap-plugin stack a real DOM keydown hits (higher-priority plugins
 * first, first-match-wins). Returns whether a binding claimed the event. `mod`
 * maps to CTRL because jsdom is a non-mac platform.
 */
function pressKey(
  editor: Editor,
  key: string,
  opts: { mod?: boolean; shift?: boolean; alt?: boolean } = {},
): boolean {
  const isLetter = key.length === 1 && /[a-z]/i.test(key)
  const event = new KeyboardEvent('keydown', {
    key: isLetter ? key.toLowerCase() : key,
    ctrlKey: opts.mod ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
    bubbles: true,
    cancelable: true,
  })
  return editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) ?? false
}

// ── Editor factory ───────────────────────────────────────────────────────────

let onInsertLink: Mock<() => void>
let onAddComment: Mock<() => void>
let onShowShortcuts: Mock<() => void>
let editor: Editor

function build(content: string): Editor {
  onInsertLink = vi.fn<() => void>()
  onAddComment = vi.fn<() => void>()
  onShowShortcuts = vi.fn<() => void>()
  return new Editor({
    extensions: [
      ...baseExtensions,
      makeShortcutKeymap({
        onInsertLink: () => onInsertLink(),
        onAddComment: () => onAddComment(),
        onShowShortcuts: () => onShowShortcuts(),
      }),
    ],
    content,
  })
}

afterEach(() => {
  editor?.destroy()
})

// ── moveBlock command (direct) ───────────────────────────────────────────────

describe('moveBlock command', () => {
  it('moves the current block down, swapping with the next sibling', () => {
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 0)
    const ok = editor.commands.moveBlock('down')
    expect(ok).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['two', 'one', 'three'])
  })

  it('moves the current block up, swapping with the previous sibling', () => {
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 2)
    const ok = editor.commands.moveBlock('up')
    expect(ok).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['one', 'three', 'two'])
  })

  it('keeps the cursor inside the moved block after moving down', () => {
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 0)
    editor.commands.moveBlock('down')
    const blockText = editor.state.selection.$from.node(1)?.textContent
    expect(blockText).toBe('one')
  })

  it('is a no-op (returns false) at the top boundary when moving up', () => {
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 0)
    const ok = editor.commands.moveBlock('up')
    expect(ok).toBe(false)
    expect(nonEmptyTexts(editor)).toEqual(['one', 'two', 'three'])
  })

  it('is a no-op (returns false) at the bottom boundary when moving down', () => {
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 2)
    const ok = editor.commands.moveBlock('down')
    expect(ok).toBe(false)
    expect(nonEmptyTexts(editor)).toEqual(['one', 'two', 'three'])
  })

  it('dispatches exactly ONE doc-changing transaction (Yjs-safe)', () => {
    // baseExtensions disable StarterKit undo/redo (Collaboration owns undo in
    // the real app), so assert the Yjs-safety property directly: one move is
    // ONE transaction → one CRDT update, atomic for collaborators.
    editor = build('<p>one</p><p>two</p><p>three</p>')
    cursorInBlock(editor, 0)
    let docChanges = 0
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) docChanges++
    })
    editor.commands.moveBlock('down')
    expect(docChanges).toBe(1)
    expect(nonEmptyTexts(editor)).toEqual(['two', 'one', 'three'])
  })

  it('moves a heading block just like a paragraph', () => {
    editor = build('<h2>Title</h2><p>body</p>')
    cursorInBlock(editor, 1) // paragraph "body"
    const ok = editor.commands.moveBlock('up')
    expect(ok).toBe(true)
    // body now precedes the heading (trailing auto-fill paragraph ignored).
    expect(nonEmptyTexts(editor)).toEqual(['body', 'Title'])
    const headingBlock = docContent(editor).find((n) => n.type === 'heading')
    expect(headingBlock?.content?.[0]?.text).toBe('Title')
  })
})

// ── duplicateBlock command (direct) ──────────────────────────────────────────

describe('duplicateBlock command', () => {
  it('inserts a copy of the current block immediately after it', () => {
    editor = build('<p>alpha</p><p>beta</p>')
    cursorInBlock(editor, 0)
    const ok = editor.commands.duplicateBlock()
    expect(ok).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['alpha', 'alpha', 'beta'])
  })

  it('duplicates the LAST block correctly (boundary)', () => {
    editor = build('<p>alpha</p><p>beta</p>')
    cursorInBlock(editor, 1)
    const ok = editor.commands.duplicateBlock()
    expect(ok).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['alpha', 'beta', 'beta'])
  })

  it('preserves the block type + attrs when duplicating a heading', () => {
    editor = build('<h3>Chapter</h3><p>x</p>')
    cursorInBlock(editor, 0)
    editor.commands.duplicateBlock()
    const headings = docContent(editor).filter((n) => n.type === 'heading')
    expect(headings.length).toBe(2)
    expect(headings.every((h) => h.attrs?.level === 3)).toBe(true)
    expect(headings.every((h) => h.content?.[0]?.text === 'Chapter')).toBe(true)
  })

  it('dispatches exactly ONE doc-changing transaction (Yjs-safe)', () => {
    editor = build('<p>alpha</p><p>beta</p>')
    cursorInBlock(editor, 0)
    let docChanges = 0
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) docChanges++
    })
    editor.commands.duplicateBlock()
    expect(docChanges).toBe(1)
    expect(nonEmptyTexts(editor)).toEqual(['alpha', 'alpha', 'beta'])
  })
})

// ── normalText command (direct) ──────────────────────────────────────────────

describe('normalText command', () => {
  it('converts a heading back to a paragraph', () => {
    editor = build('<h1>Heading</h1><p>guard</p>')
    cursorInBlock(editor, 0)
    const ok = editor.commands.normalText()
    expect(ok).toBe(true)
    // First block is now a paragraph carrying the same text.
    expect(topTypes(editor)[0]).toBe('paragraph')
    expect(topTexts(editor)[0]).toBe('Heading')
  })
})

// ── Key bindings win over StarterKit defaults (routed keydown) ────────────────

describe('key binding precedence (routed keydown)', () => {
  it('Mod-Enter inserts a pageBreak, NOT a hardBreak', () => {
    editor = build('<p>hello</p>')
    editor.commands.setTextSelection(3)
    expect(countNodes(editor, 'pageBreak')).toBe(0)
    const handled = pressKey(editor, 'Enter', { mod: true })
    expect(handled).toBe(true)
    expect(countNodes(editor, 'pageBreak')).toBe(1)
    // The StarterKit hardBreak default must NOT have fired.
    expect(countNodes(editor, 'hardBreak')).toBe(0)
  })

  it('Mod-Enter works in a heading too (paged + continuous share the command)', () => {
    editor = build('<h1>Title</h1>')
    editor.commands.setTextSelection(3)
    const handled = pressKey(editor, 'Enter', { mod: true })
    expect(handled).toBe(true)
    expect(countNodes(editor, 'pageBreak')).toBe(1)
  })

  it('typing right after Mod-Enter at END of doc lands AFTER the break (break survives)', () => {
    // Live-verify regression: insertContent of the atom at the end of a block
    // left a NodeSelection ON the pageBreak, so the next keystroke REPLACED it.
    // The binding now hops the cursor to the next text position.
    editor = build('<p>Page one text</p>')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1) // end
    pressKey(editor, 'Enter', { mod: true })
    expect(countNodes(editor, 'pageBreak')).toBe(1)
    // The selection must be a caret in a TEXT block, not the atom.
    expect(editor.state.selection.empty).toBe(true)
    editor.commands.insertContent('X')
    expect(countNodes(editor, 'pageBreak')).toBe(1) // break survived typing
    const texts = topTexts(editor)
    expect(texts[0]).toBe('Page one text')
    expect(texts[texts.length - 1]).toBe('X') // typed AFTER the break
  })

  it('Shift-Enter still produces a hardBreak (soft line break untouched)', () => {
    editor = build('<p>keep</p>')
    editor.commands.setTextSelection(3)
    const handled = pressKey(editor, 'Enter', { shift: true })
    expect(handled).toBe(true)
    expect(countNodes(editor, 'hardBreak')).toBe(1)
    expect(countNodes(editor, 'pageBreak')).toBe(0)
  })

  it('Mod-Shift-K invokes the insert-link callback', () => {
    editor = build('<p>link me</p>')
    const handled = pressKey(editor, 'k', { mod: true, shift: true })
    expect(handled).toBe(true)
    expect(onInsertLink).toHaveBeenCalledTimes(1)
  })

  it('Mod-Alt-M invokes the add-comment callback', () => {
    editor = build('<p>comment me</p>')
    const handled = pressKey(editor, 'm', { mod: true, alt: true })
    expect(handled).toBe(true)
    expect(onAddComment).toHaveBeenCalledTimes(1)
  })

  it('Mod-/ invokes the show-shortcuts callback', () => {
    editor = build('<p>help me</p>')
    const handled = pressKey(editor, '/', { mod: true })
    expect(handled).toBe(true)
    expect(onShowShortcuts).toHaveBeenCalledTimes(1)
  })

  it('Mod-Shift-Down moves the current block down', () => {
    editor = build('<p>a</p><p>b</p>')
    cursorInBlock(editor, 0)
    const handled = pressKey(editor, 'ArrowDown', { mod: true, shift: true })
    expect(handled).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['b', 'a'])
  })

  it('Mod-Shift-Up moves the current block up', () => {
    editor = build('<p>a</p><p>b</p>')
    cursorInBlock(editor, 1)
    const handled = pressKey(editor, 'ArrowUp', { mod: true, shift: true })
    expect(handled).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['b', 'a'])
  })

  it('Mod-D duplicates the current block', () => {
    editor = build('<p>dup</p>')
    cursorInBlock(editor, 0)
    const handled = pressKey(editor, 'd', { mod: true })
    expect(handled).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['dup', 'dup'])
  })

  it('Mod-Alt-0 converts the current heading to normal text', () => {
    editor = build('<h1>Head</h1><p>guard</p>')
    cursorInBlock(editor, 0)
    const handled = pressKey(editor, '0', { mod: true, alt: true })
    expect(handled).toBe(true)
    expect(topTypes(editor)[0]).toBe('paragraph')
    expect(topTexts(editor)[0]).toBe('Head')
  })

  it('Mod-Shift-Up at the TOP boundary is swallowed (no native select-to-top), doc unchanged', () => {
    editor = build('<p>a</p><p>b</p>')
    cursorInBlock(editor, 0)
    const handled = pressKey(editor, 'ArrowUp', { mod: true, shift: true })
    // Swallowed even though the move is a no-op — otherwise the browser's
    // native select-to-document-start would fire mid-muscle-memory.
    expect(handled).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['a', 'b'])
  })

  it('Mod-Shift-Down at the BOTTOM boundary is swallowed, doc unchanged', () => {
    editor = build('<p>a</p><p>b</p>')
    cursorInBlock(editor, 1)
    const handled = pressKey(editor, 'ArrowDown', { mod: true, shift: true })
    expect(handled).toBe(true)
    expect(nonEmptyTexts(editor)).toEqual(['a', 'b'])
  })

  it('Mod-D duplicates a NodeSelection-selected atom block (e.g. a page break)', () => {
    editor = build('<p>before</p>')
    editor.commands.setTextSelection(3)
    editor.commands.insertPageBreak()
    expect(countNodes(editor, 'pageBreak')).toBe(1)
    // Select the pageBreak node itself (as a click on it would).
    let pageBreakPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'pageBreak') pageBreakPos = pos
    })
    expect(pageBreakPos).toBeGreaterThanOrEqual(0)
    editor.commands.setNodeSelection(pageBreakPos)
    const handled = pressKey(editor, 'd', { mod: true })
    expect(handled).toBe(true)
    expect(countNodes(editor, 'pageBreak')).toBe(2)
  })
})

// ── Verified StarterKit / extension defaults ─────────────────────────────────
//
// The v0.2.10 help-dialog sync documents these pre-existing defaults. Each row
// below is the executable proof that the combo ACTUALLY works in Parchment's
// extension setup (the brief: "do not document a shortcut you didn't verify").
// NOTE: highlight's Mod-Shift-h is intentionally NOT here — FindReplace (added
// later in Editor.tsx) claims that combo for Replace, shadowing highlight.

describe('verified built-in defaults (documented in the help dialog)', () => {
  it('Mod-Alt-1 → heading 1', () => {
    editor = build('<p>t</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, '1', { mod: true, alt: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('heading')
    expect(docContent(editor)[0]?.attrs?.level).toBe(1)
  })

  it('Mod-Alt-6 → heading 6', () => {
    editor = build('<p>t</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, '6', { mod: true, alt: true })).toBe(true)
    expect(docContent(editor)[0]?.attrs?.level).toBe(6)
  })

  it('Mod-Shift-7 → ordered list', () => {
    editor = build('<p>item</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, '7', { mod: true, shift: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('orderedList')
  })

  it('Mod-Shift-8 → bullet list', () => {
    editor = build('<p>item</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, '8', { mod: true, shift: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('bulletList')
  })

  it('Mod-Shift-9 → task list (checklist)', () => {
    editor = build('<p>todo</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, '9', { mod: true, shift: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('taskList')
  })

  it('Mod-Alt-C → code block', () => {
    editor = build('<p>code</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, 'c', { mod: true, alt: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('codeBlock')
  })

  it('Mod-Shift-B → blockquote', () => {
    editor = build('<p>quote</p><p>guard</p>')
    cursorInBlock(editor, 0)
    expect(pressKey(editor, 'b', { mod: true, shift: true })).toBe(true)
    expect(topTypes(editor)[0]).toBe('blockquote')
  })

  it('Mod-E → inline code mark', () => {
    editor = build('<p>mono</p>')
    editor.commands.selectAll()
    expect(pressKey(editor, 'e', { mod: true })).toBe(true)
    expect(editor.isActive('code')).toBe(true)
  })

  it('Mod-Shift-S → strikethrough (NOT Mod-Shift-X in this setup)', () => {
    editor = build('<p>gone</p>')
    editor.commands.selectAll()
    expect(pressKey(editor, 's', { mod: true, shift: true })).toBe(true)
    expect(editor.isActive('strike')).toBe(true)
  })

  it('Mod-Shift-X does NOT toggle strike here (guards the docs claim)', () => {
    editor = build('<p>keep</p>')
    editor.commands.selectAll()
    pressKey(editor, 'x', { mod: true, shift: true })
    expect(editor.isActive('strike')).toBe(false)
  })

  it('Mod-, → subscript and Mod-. → superscript', () => {
    editor = build('<p>sub</p>')
    editor.commands.selectAll()
    expect(pressKey(editor, ',', { mod: true })).toBe(true)
    expect(editor.isActive('subscript')).toBe(true)
    editor.destroy()
    editor = build('<p>sup</p>')
    editor.commands.selectAll()
    expect(pressKey(editor, '.', { mod: true })).toBe(true)
    expect(editor.isActive('superscript')).toBe(true)
  })

  it('Mod-Shift-L/E/R/J → text alignment', () => {
    const cases: Array<[string, string]> = [
      ['l', 'left'],
      ['e', 'center'],
      ['r', 'right'],
      ['j', 'justify'],
    ]
    for (const [key, align] of cases) {
      editor = build('<p>align me</p><p>guard</p>')
      cursorInBlock(editor, 0)
      expect(pressKey(editor, key, { mod: true, shift: true }), `Mod-Shift-${key}`).toBe(true)
      expect(docContent(editor)[0]?.attrs?.textAlign, `align ${align}`).toBe(align)
      editor.destroy()
    }
  })
})

// ── Extension shape ──────────────────────────────────────────────────────────

describe('ShortcutKeymap extension shape', () => {
  it('is a Tiptap extension named "shortcutKeymap"', () => {
    expect(ShortcutKeymap.name).toBe('shortcutKeymap')
  })

  it('has a high priority so its bindings win over StarterKit', () => {
    const priority = (ShortcutKeymap as unknown as { config: { priority?: number } }).config
      .priority
    expect(priority).toBeGreaterThan(100)
  })
})
