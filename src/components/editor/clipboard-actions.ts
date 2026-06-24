'use client'

import type { Editor } from '@tiptap/core'
import { plainTextToContent } from '@/lib/editor/clipboard'

// F5 — imperative Edit-menu clipboard actions (Cut / Copy / Paste / Paste
// without formatting). Kept out of MenuBar.tsx so the menu config stays
// declarative. Every action FIRST refocuses the editor: the shared Menu closes
// (restoring focus to its trigger button) BEFORE calling onSelect, so without
// this guard document.execCommand would target the trigger, not the document.
//
// All ops degrade gracefully — clipboard access can be denied (permission) or
// absent (insecure context / older browser). On failure we log and return,
// never throw, so a denied clipboard can't crash the editor.

/** Refocus the editor's contenteditable so clipboard ops target the selection. */
function refocusEditor(editor: Editor): void {
  editor.commands.focus()
  // Belt-and-braces: ensure the DOM node itself is focused for execCommand.
  editor.view.dom.focus()
}

/**
 * Run document.execCommand for cut/copy/paste inside the focused contenteditable.
 * Returns true when the command reports success.
 */
function execClipboard(command: 'cut' | 'copy' | 'paste'): boolean {
  try {
    return document.execCommand(command)
  } catch {
    return false
  }
}

export function cutSelection(editor: Editor): void {
  refocusEditor(editor)
  if (execClipboard('cut')) return
  // Fallback: async Clipboard API — write the selected text, then delete it.
  const { from, to } = editor.state.selection
  if (from === to) return
  const text = editor.state.doc.textBetween(from, to, '\n')
  void writeClipboard(text).then((ok) => {
    if (ok) editor.chain().focus().deleteSelection().run()
  })
}

export function copySelection(editor: Editor): void {
  refocusEditor(editor)
  if (execClipboard('copy')) return
  const { from, to } = editor.state.selection
  if (from === to) return
  const text = editor.state.doc.textBetween(from, to, '\n')
  void writeClipboard(text)
}

export function pasteFromClipboard(editor: Editor): void {
  refocusEditor(editor)
  if (execClipboard('paste')) return
  // Fallback: async Clipboard API readText → let the editor parse it.
  void readClipboard().then((text) => {
    if (text === null) return
    editor.chain().focus().insertContent(text).run()
  })
}

/**
 * Paste without formatting: read plain text from the clipboard and insert it as
 * bare paragraphs/hardBreaks (all marks stripped). Replaces the current
 * selection. Degrades gracefully if the clipboard is unavailable/denied.
 */
export function pasteWithoutFormatting(editor: Editor): void {
  refocusEditor(editor)
  void readClipboard().then((text) => {
    if (text === null) return
    const content = plainTextToContent(text)
    if (content.length === 0) return
    editor.chain().focus().insertContent(content).run()
  })
}

async function readClipboard(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText) return null
    return await navigator.clipboard.readText()
  } catch (err) {
    console.warn('[parchment] clipboard read unavailable', err)
    return null
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.warn('[parchment] clipboard write unavailable', err)
    return false
  }
}
