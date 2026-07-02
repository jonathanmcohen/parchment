/**
 * G14 / v0.2.10 — SmartPaste Tiptap extension.
 *
 * Adds:
 *  - transformPastedHTML: sniff + normalize foreign HTML (Word/GDocs/Notion/web).
 *    Pass-through for 'plain' (internal copy-paste) and 'markdown'. SKIPPED when
 *    the caret is inside a code block (raw text belongs there — v0.2.10).
 *  - handlePaste: intercept plain-text markdown paste → parseMarkdown → insert.
 *    Returns false for image/file clipboard data so the existing B5 image-paste
 *    handler in Editor.tsx continues to work.
 *  - pastePlainText command + Mod-Shift-v shortcut: paste WITHOUT formatting —
 *    plain paragraphs (double newline = new paragraph, single newline = hard
 *    break), all marks stripped, regardless of the clipboard's HTML (v0.2.10).
 *
 * DOMParser is only called inside transformPastedHTML (browser runtime).
 * This module never calls DOMParser at import/module-load time, so
 * getSchema(baseExtensions) still builds in the Next.js server runtime.
 * plainTextToContent (src/lib/editor/clipboard.ts) is a PURE module — safe to
 * import here on the server path.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { plainTextToContent } from '@/lib/editor/clipboard'
import { looksLikeMarkdown, normalizePastedHtml, sniffPasteSource } from '@/lib/editor/smart-paste'
import { markdownToJson } from '@/lib/markdown/parse'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartPaste: {
      /**
       * Insert `text` as plain content with ALL formatting stripped: blank-line-
       * separated blocks become paragraphs, single newlines become hard breaks.
       * Backs "paste without formatting" (Mod+Shift+V). Replaces the selection.
       */
      pastePlainText: (text: string) => ReturnType
    }
  }
}

// DISTINCT plugin key — never share with slashMenu, wikiSuggestion, or citeSuggestion.
export const smartPasteKey = new PluginKey('smartPaste')

export const SmartPasteExtension = Extension.create({
  name: 'smartPaste',

  /**
   * Normalize foreign HTML before ProseMirror parses it.
   * Internal Parchment copy-paste is detected as 'plain' → pass through unchanged.
   *
   * v0.2.10: SKIP entirely when the caret is inside a code block. A code block's
   * content is `code` (plain text) — pasted HTML must land verbatim (angle
   * brackets, tags, and all) so source snippets survive. Normalizing here would
   * unwrap/strip the very characters the user is pasting as text.
   *
   * CRITICAL: this MUST be declared as a Tiptap extension-level field, NOT as a
   * ProseMirror plugin prop. Tiptap COMPOSES every extension's transformPastedHTML
   * into one editor-level function (extensionManager.transformPastedHTML), and
   * ProseMirror's view.someProp('transformPastedHTML', …) checks the editor-level
   * prop BEFORE any plugin prop. Tiptap's composed default is identity (`e => e`),
   * so a plugin-prop transformPastedHTML is silently shadowed by it and never runs
   * (this exact bug shipped first — Word/GDocs paste was not normalized live even
   * though the unit tests of the pure normalizer passed).
   */
  transformPastedHTML(html: string): string {
    // Raw paste into a code block — never touch the HTML.
    if (this.editor?.isActive('codeBlock')) return html
    const src = sniffPasteSource(html, '')
    if (src === 'plain') return html
    return normalizePastedHtml(html, src)
  },

  addCommands() {
    return {
      pastePlainText:
        (text: string) =>
        ({ commands }) => {
          const content = plainTextToContent(text)
          if (content.length === 0) return false
          // insertContent replaces the current selection; the content array
          // carries only text/hardBreak/paragraph nodes with NO marks, so the
          // result can carry no bold/italic/colour/etc.
          return commands.insertContent(content)
        },
    }
  },

  /**
   * Mod+Shift+V — paste without formatting. Reads plain text from the clipboard
   * (async Clipboard API) and inserts it via pastePlainText. We own this binding;
   * the shortcuts agent was told not to touch it. Returns true to preventDefault
   * so the browser's own formatted paste never also fires.
   */
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-v': () => {
        const editor = this.editor
        // Clipboard read is async; do it out-of-band and insert when it resolves.
        // If the clipboard is unavailable/denied we simply do nothing (the event
        // is still consumed, matching "paste without formatting" intent).
        void readClipboardText().then((text) => {
          if (text === null || text.length === 0) return
          editor.chain().focus().pastePlainText(text).run()
        })
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: smartPasteKey,

        props: {
          /**
           * Handle paste events. We intercept only the markdown-as-plaintext case.
           * Returns false in all other cases so:
           *   - image/file paste falls through to the B5 editorProps handler
           *   - HTML paste falls through to transformPastedHTML above
           *   - normal text paste falls through to ProseMirror default
           */
          handlePaste(view, event): boolean {
            const cd = event.clipboardData
            if (!cd) return false

            // v0.2.10: inside a code block, never reinterpret pasted plain text as
            // markdown — raw text belongs there. Let ProseMirror's default handle it.
            if (view.state.selection.$from.parent.type.name === 'codeBlock') return false

            // If the clipboard has files/images, let the existing image-paste handler run.
            // Mirror the B5 handler in Editor.tsx which checks cd.items for image/* types.
            // Browser-copied images (right-click → copy image) appear in cd.items with type
            // 'image/png' but cd.files.length is 0, so we must check items too.
            if (cd.files && cd.files.length > 0) return false
            if (cd.items && Array.from(cd.items).some((item) => item.type.startsWith('image/')))
              return false

            // If there is HTML content (non-empty), let transformPastedHTML handle it.
            const htmlContent = cd.getData('text/html')
            if (htmlContent && htmlContent.trim().length > 0) return false

            // Plain text only — check for markdown
            const text = cd.getData('text/plain')
            if (!text || !looksLikeMarkdown(text)) return false

            // Parse markdown → PM JSON and insert at the current selection.
            const json = markdownToJson(text)
            if (!json || !Array.isArray((json as { content?: unknown }).content)) return false

            const { state, dispatch } = view
            const schema = state.schema

            // Build a Fragment from the parsed content array, then replace the selection.
            try {
              const pmNode = schema.nodeFromJSON(json)
              // Insert all top-level children of the parsed doc
              const tr = state.tr
              const { from, to } = state.selection
              tr.replaceWith(from, to, pmNode.content)
              dispatch(tr.scrollIntoView())
              return true
            } catch {
              // Fallback: let ProseMirror handle it normally
              return false
            }
          },
        },
      }),
    ]
  },
})

/**
 * Read plain text from the clipboard via the async Clipboard API. Browser-only
 * and fully guarded: returns null when the API is missing (insecure context /
 * older browser) or the read is denied. Never throws.
 */
async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
