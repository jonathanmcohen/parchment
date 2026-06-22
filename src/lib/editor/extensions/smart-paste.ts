/**
 * G14 — SmartPaste Tiptap extension.
 *
 * Adds a ProseMirror plugin with:
 *  - transformPastedHTML: sniff + normalize foreign HTML (Word/GDocs/Notion/web).
 *    Pass-through for 'plain' (internal copy-paste) and 'markdown'.
 *  - handlePaste: intercept plain-text markdown paste → parseMarkdown → insert.
 *    Returns false for image/file clipboard data so the existing B5 image-paste
 *    handler in Editor.tsx continues to work.
 *
 * DOMParser is only called inside transformPastedHTML (browser runtime).
 * This module never calls DOMParser at import/module-load time, so
 * getSchema(baseExtensions) still builds in the Next.js server runtime.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { looksLikeMarkdown, normalizePastedHtml, sniffPasteSource } from '@/lib/editor/smart-paste'
import { markdownToJson } from '@/lib/markdown/parse'

// DISTINCT plugin key — never share with slashMenu, wikiSuggestion, or citeSuggestion.
export const smartPasteKey = new PluginKey('smartPaste')

export const SmartPasteExtension = Extension.create({
  name: 'smartPaste',

  /**
   * Normalize foreign HTML before ProseMirror parses it.
   * Internal Parchment copy-paste is detected as 'plain' → pass through unchanged.
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
    const src = sniffPasteSource(html, '')
    if (src === 'plain') return html
    return normalizePastedHtml(html, src)
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
