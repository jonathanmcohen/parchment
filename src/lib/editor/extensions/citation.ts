/**
 * G7b — Citation editor integration: inline citation node + bibliography block
 * + resolution plugin + commands.
 *
 * LIBRARY BOUNDARY: @/lib/citations/{types,format,crossref} are pure-TS modules
 * (no React, no db, no window) — safe to import here and in serialize/parse.
 * ReactNodeViewRenderer is lazy-required in addNodeView (same pattern as
 * drawing.ts / mermaid.ts) so getSchema(baseExtensions) builds server-side.
 *
 * RESOLUTION PLUGIN (mirror of math.ts numbering):
 *   On every doc change the plugin walks the doc to find the (first) bibliography
 *   node, reads its {refs, style} attrs, and builds a Map<citeKey, {inText, index}>
 *   via formatInText. CitationView reads the map through the plugin key to render
 *   the resolved in-text string. The plugin also dispatches a meta transaction so
 *   all citation NodeViews repaint (same pattern as mathNumberingKey).
 *
 * DISTINCT PluginKey: citationResolveKey is a NEW PluginKey('citationResolve') —
 * it NEVER shares a key with any other Suggestion plugin or numbering plugin (F6
 * lesson: shared keys crash the editor).
 */

import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { formatInText } from '@/lib/citations/format'
import type { CiteStyle, CslEntry } from '@/lib/citations/types'
import { parseCslEntries } from '@/lib/citations/types'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      /** Insert an inline citation atom for `citeKey`. */
      insertCitation: (citeKey: string, page?: string) => ReturnType
    }
    bibliography: {
      /** Insert an empty bibliography block. */
      insertBibliography: () => ReturnType
      /** Update the bibliography node at `pos`. */
      updateBibliography: (pos: number, refs: CslEntry[], style: CiteStyle) => ReturnType
      /**
       * Find the bibliography node (create one at doc end if none), append
       * `entry` to its refs (deduped by id). Used by DOI-add + manual-add.
       */
      addReference: (entry: CslEntry) => ReturnType
    }
  }
}

// ── Resolution plugin ────────────────────────────────────────────────────────

export type CitationResolution = Map<string, { inText: string; index: number }>

/** Plugin key — DISTINCT from every other key (F6 lesson). */
export const citationResolveKey = new PluginKey<CitationResolution>('citationResolve')

const CITE_REPAINT_META = 'parchmentCiteRepaint'

function buildResolution(doc: PMNode): CitationResolution {
  const map: CitationResolution = new Map()
  let bibRefs: CslEntry[] = []
  let bibStyle: CiteStyle = 'apa'
  let found = false

  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'bibliography') {
      found = true
      bibRefs = parseCslEntries(node.attrs.refs)
      const s = node.attrs.style
      if (s === 'apa' || s === 'mla' || s === 'chicago') bibStyle = s
      return false
    }
    return true
  })

  bibRefs.forEach((entry, index) => {
    const inText = formatInText(entry, bibStyle)
    map.set(entry.id, { inText, index })
  })
  return map
}

function requestCiteRepaint(view: EditorView): void {
  if (view.isDestroyed) return
  queueMicrotask(() => {
    if (view.isDestroyed) return
    view.dispatch(view.state.tr.setMeta(CITE_REPAINT_META, true))
  })
}

function makeCitationResolutionPlugin(): Plugin<CitationResolution> {
  return new Plugin<CitationResolution>({
    key: citationResolveKey,
    state: {
      init(_config, state) {
        return buildResolution(state.doc)
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged && !tr.getMeta(CITE_REPAINT_META)) return old
        if (!tr.docChanged) return old
        return buildResolution(newState.doc)
      },
    },
    view(view) {
      let prev = citationResolveKey.getState(view.state)
      return {
        update(v) {
          const next = citationResolveKey.getState(v.state)
          if (next !== prev) {
            prev = next
            requestCiteRepaint(v)
          }
        },
      }
    },
  })
}

// ── bibliography — block atom node ───────────────────────────────────────────

/**
 * bibliography — a block, atomic node holding the document's reference list.
 * attrs: refs (CslEntry[]), style (CiteStyle).
 * The NodeView (BibliographyView.tsx) renders an interactive reference list.
 */
export const BibliographyExtension = Node.create({
  name: 'bibliography',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      refs: {
        default: [],
        parseHTML: (el) => {
          const raw = el.getAttribute('data-bibliography-refs')
          if (!raw) return []
          try {
            return parseCslEntries(JSON.parse(raw) as unknown)
          } catch {
            return []
          }
        },
        renderHTML: (attrs) => ({
          'data-bibliography-refs': JSON.stringify(Array.isArray(attrs.refs) ? attrs.refs : []),
        }),
      },
      style: {
        default: 'apa' as CiteStyle,
        parseHTML: (el) => {
          const s = el.getAttribute('data-bibliography-style')
          if (s === 'apa' || s === 'mla' || s === 'chicago') return s
          return 'apa'
        },
        renderHTML: (attrs) => ({
          'data-bibliography-style': String(attrs.style ?? 'apa'),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bibliography]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-bibliography': '' })]
  },

  addNodeView() {
    // Lazy-require so getSchema(baseExtensions) builds server-side.
    try {
      const { BibliographyView } = require('@/components/editor/BibliographyView') as {
        BibliographyView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(BibliographyView)
    } catch {
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertBibliography:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { refs: [], style: 'apa' },
          }),

      updateBibliography:
        (pos, refs, style) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null and optional chain changes the falsy guard
          if (!target || target.type.name !== 'bibliography') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, refs, style })
            dispatch(tr)
          }
          return true
        },

      addReference:
        (entry) =>
        ({ tr, dispatch, state, commands }) => {
          // Find the bibliography node in the doc.
          let bibPos: number | null = null
          let bibNode: PMNode | null = null
          state.doc.descendants((node, pos) => {
            if (bibPos !== null) return false
            if (node.type.name === 'bibliography') {
              bibPos = pos
              bibNode = node
              return false
            }
            return true
          })

          if (bibPos !== null && bibNode !== null) {
            // Dedupe: skip if already present.
            const existing = parseCslEntries((bibNode as PMNode).attrs.refs as unknown)
            if (existing.some((e) => e.id === entry.id)) return true
            const updated = [...existing, entry]
            if (dispatch) {
              tr.setNodeMarkup(bibPos, undefined, {
                ...(bibNode as PMNode).attrs,
                refs: updated,
              })
              dispatch(tr)
            }
            return true
          }

          // No bibliography node — insert one at doc end with this entry.
          return commands.insertContentAt(state.doc.content.size, {
            type: 'bibliography',
            attrs: { refs: [entry], style: 'apa' },
          })
        },
    }
  },

  addProseMirrorPlugins() {
    return [makeCitationResolutionPlugin()]
  },
})

// ── citation — inline atom node ───────────────────────────────────────────────

/**
 * citation — an inline, atomic node referencing a bibliography entry by id.
 * Renders the in-text citation string resolved from the bibliography + style
 * via the citationResolveKey plugin state. If unresolved → "(?)" placeholder.
 */
export const CitationExtension = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      citeKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cite-key') ?? '',
        renderHTML: (attrs) => ({ 'data-cite-key': String(attrs.citeKey ?? '') }),
      },
      page: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cite-page') ?? '',
        renderHTML: (attrs) => {
          const p = String(attrs.page ?? '')
          return p ? { 'data-cite-page': p } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-citation]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation': '',
        class: 'parchment-citation',
      }),
      `[@${String(node.attrs.citeKey ?? '')}]`,
    ]
  },

  renderText({ node }) {
    return `[@${String(node.attrs.citeKey ?? '')}]`
  },

  addNodeView() {
    // Lazy-require so getSchema(baseExtensions) builds server-side.
    try {
      const { CitationView } = require('@/components/editor/CitationView') as {
        CitationView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(CitationView)
    } catch {
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertCitation:
        (citeKey, page?) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { citeKey, page: page ?? '' },
          }),
    }
  },
})

// ── CitationCommands — shared extension (no schema node) ─────────────────────

/**
 * Thin extension exporting the shared `insertCitation` command (so callers
 * can reference it without pulling the full CitationExtension). Modelled after
 * MathCommands — no schema node.
 */
export const CitationCommands = Extension.create({
  name: 'citationCommands',
  // Commands are already registered on CitationExtension + BibliographyExtension.
  // This extension is a no-op carried for symmetry with the math pattern.
})
