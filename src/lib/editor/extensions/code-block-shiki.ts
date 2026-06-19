/**
 * CodeBlockShiki — Tiptap extension (C3/C4).
 *
 * Extends the base CodeBlock node with:
 *  - A `theme` attribute (default: DEFAULT_THEME, stored as data-theme).
 *  - A ProseMirror decoration plugin that syntax-highlights code block content
 *    via Shiki inline token colours, WITHOUT replacing editable text nodes.
 *
 * Architecture (keep code editable):
 *  Shiki produces ThemedToken[][] (array of lines, each line an array of tokens
 *  with { content, color }). We map each token to a ProseMirror Decoration.inline
 *  with a style="color: <color>" attribute applied over the corresponding text
 *  range inside the <pre><code> node. The underlying text nodes remain fully
 *  editable — decorations are just cosmetic overlays.
 *
 * Async language loading:
 *  ProseMirror's decoration system is synchronous, but Shiki's loadLanguage is
 *  async. We handle this via:
 *    1. Keep a Set of already-loaded languages (isLanguageLoaded).
 *    2. On each decoration pass: if the language is not yet loaded, render
 *       the block plaintext AND fire ensureLanguage() in the background.
 *    3. When ensureLanguage() resolves, dispatch a no-op meta transaction
 *       (shikiReady: true) to trigger a decoration rebuild. Guard against
 *       dispatching into a destroyed view.
 */

import { CodeBlock } from '@tiptap/extension-code-block'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { BundledLanguage, BundledTheme } from 'shiki'
import type { ShikiTheme } from '@/lib/editor/shiki/highlighter'
import {
  DEFAULT_THEME,
  ensureLanguage,
  getHighlighter,
  isLanguageLoaded,
  SHIKI_THEMES,
} from '@/lib/editor/shiki/highlighter'
import { normalizeLang } from '@/lib/editor/shiki/languages'

// ── Plugin key ─────────────────────────────────────────────────────────────

const shikiPluginKey = new PluginKey<DecorationSet>('shikiHighlight')

// ── Decoration builder ─────────────────────────────────────────────────────

/**
 * Walk the document and build a DecorationSet with inline color decorations
 * for every codeBlock node whose language grammar is already loaded.
 *
 * For blocks whose language is not yet loaded this function fires
 * ensureLanguage() as a side-effect and registers a callback to re-decorate
 * via a no-op meta transaction once the grammar arrives.
 */
function buildDecorations(state: EditorState, view: EditorView | null): DecorationSet {
  const decorations: Decoration[] = []

  // We need the highlighter synchronously — if it's not ready yet, return empty.
  // (getHighlighter() is async; we store a resolved reference in module scope
  // once the first async init completes.)
  const hl = _resolvedHighlighter
  if (hl === null) {
    // Trigger init if not already started.
    void _initHighlighter(view)
    return DecorationSet.empty
  }

  state.doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name !== 'codeBlock') return true

    const rawLang = (node.attrs as Record<string, unknown>).language as string | undefined
    const rawTheme = (node.attrs as Record<string, unknown>).theme as string | undefined
    const lang = normalizeLang(rawLang)
    const theme: ShikiTheme =
      rawTheme !== undefined &&
      rawTheme !== null &&
      (SHIKI_THEMES as readonly string[]).includes(rawTheme)
        ? (rawTheme as ShikiTheme)
        : DEFAULT_THEME

    if (lang === 'plaintext' || !isLanguageLoaded(lang)) {
      if (lang !== 'plaintext') {
        // Kick off async load; re-decorate on completion.
        void ensureLanguage(lang).then((ok) => {
          if (ok && view !== null && !view.isDestroyed) {
            view.dispatch(view.state.tr.setMeta('shikiReady', true))
          }
        })
      }
      return true
    }

    // Node position: pos points to the opening token of the codeBlock node.
    // The code content starts at pos + 1 (inside the node).
    const textStart = pos + 1
    const code = node.textContent

    let lines: { content: string; color?: string | undefined }[][]
    try {
      // Cast lang/theme to branded Shiki types — we've already validated they
      // are loaded and in-range via isLanguageLoaded + SHIKI_THEMES checks above.
      const tokens = hl.codeToTokensBase(code, {
        lang: lang as BundledLanguage,
        theme: theme as BundledTheme,
      })
      lines = tokens
    } catch {
      // Unexpected error — skip decorations for this block.
      return true
    }

    let offset = textStart
    for (const line of lines) {
      for (const token of line) {
        const from = offset
        const to = from + token.content.length
        if (token.color !== undefined && token.color !== null && token.color !== '') {
          decorations.push(
            Decoration.inline(from, to, {
              style: `color: ${token.color}`,
            }),
          )
        }
        offset = to
      }
      // Account for the newline character between lines (not included in tokens).
      offset += 1
    }
    // Don't descend into codeBlock children.
    return false
  })

  return DecorationSet.create(state.doc, decorations)
}

// ── Highlighter cache ───────────────────────────────────────────────────────

/** Module-level resolved highlighter reference for sync access in buildDecorations. */
let _resolvedHighlighter: Awaited<ReturnType<typeof getHighlighter>> | null = null
let _initStarted = false

function _initHighlighter(view: EditorView | null): Promise<void> {
  if (_initStarted) return Promise.resolve()
  _initStarted = true
  return getHighlighter().then((hl) => {
    _resolvedHighlighter = hl
    if (view !== null && !view.isDestroyed) {
      view.dispatch(view.state.tr.setMeta('shikiReady', true))
    }
  })
}

// ── ProseMirror plugin ─────────────────────────────────────────────────────

function makeShikiPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: shikiPluginKey,

    state: {
      init(_config, _state) {
        // On init, view is not available yet; decorations will be built once
        // the highlighter resolves and dispatches shikiReady.
        return DecorationSet.empty
      },

      apply(tr, old, _oldState, newState) {
        // Rebuild on doc changes or on our shikiReady signal.
        if (!tr.docChanged && tr.getMeta('shikiReady') === undefined) {
          return old
        }
        // View is accessed via the plugin view closure; pass null if unavailable.
        return buildDecorations(newState, _currentView)
      },
    },

    props: {
      decorations(state) {
        return shikiPluginKey.getState(state) ?? DecorationSet.empty
      },
    },

    view(editorView) {
      _currentView = editorView
      // Trigger highlighter init now that we have the view.
      void _initHighlighter(editorView)
      return {
        destroy() {
          _currentView = null
        },
      }
    },
  })
}

/** Mutable reference updated by the plugin's view() lifecycle. */
let _currentView: EditorView | null = null

// ── Tiptap extension ────────────────────────────────────────────────────────

export const CodeBlockShiki = CodeBlock.extend({
  name: 'codeBlock',

  addAttributes() {
    return {
      // Keep the base language attribute.
      language: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-language') ?? null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const lang = attributes.language as string | null | undefined
          if (!lang) return {}
          return { 'data-language': lang, class: `language-${lang}` }
        },
      },
      // New per-block theme attribute.
      theme: {
        default: DEFAULT_THEME,
        parseHTML: (element) => element.getAttribute('data-theme') ?? DEFAULT_THEME,
        renderHTML: (attributes: Record<string, unknown>) => {
          const theme = attributes.theme as string | undefined
          return { 'data-theme': theme ?? DEFAULT_THEME }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [makeShikiPlugin()]
  },
})
