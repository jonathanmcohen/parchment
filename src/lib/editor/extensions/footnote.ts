import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FootnotesView } from '@/components/editor/FootnotesView'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /**
       * Insert a footnote reference at the current cursor position.
       * Creates the matching footnotes block (and item) at the end of the doc
       * if not already present.
       * Accepts an optional `placement` attr: 'endnote' (default) | 'footnote'.
       * NOTE: On screen both placements render at end-of-doc. True per-page
       * footer placement requires paged.js print integration (Plan H2).
       */
      insertFootnote: (opts?: { placement?: 'endnote' | 'footnote' }) => ReturnType
    }
  }
}

// ── Pure numbering helper ──────────────────────────────────────────────────

/**
 * Assign 1-based document-order numbers to a list of footnote ref ids.
 * The returned Map maps id → number.
 *
 * Pure function — no editor state, fully unit-testable.
 */
export function numberFootnotes(refIds: readonly string[]): Map<string, number> {
  const map = new Map<string, number>()
  refIds.forEach((id, i) => {
    map.set(id, i + 1)
  })
  return map
}

// ── Stable id generator ────────────────────────────────────────────────────

let _seq = 0
/**
 * Generate a stable, short id for a new footnote.
 * Uses a monotonic counter so tests get deterministic values.
 * In a real yjs-collaborative doc, a uuid would be preferred; for now this
 * is good enough for a single-user session.
 */
function nextFootnoteId(): string {
  _seq += 1
  return `fn-${_seq}`
}

// Exposed for tests only.
export function _resetFootnoteSeq(): void {
  _seq = 0
}

// ── Plugin to maintain `number` attr on footnoteRef nodes ─────────────────

const footnoteNumberingKey = new PluginKey<null>('footnoteNumbering')

/**
 * appendTransaction plugin — walks the doc after every transaction and
 * re-numbers all footnoteRef nodes so their `number` attr reflects
 * document order.  Mirrors the heading-id.ts pattern exactly.
 */
const footnoteNumberingPlugin = new Plugin({
  key: footnoteNumberingKey,
  appendTransaction(_transactions, _oldState, newState) {
    const { doc, tr } = newState
    let modified = false

    // Collect all ref ids in document order.
    const refIds: string[] = []
    doc.descendants((node: PMNode) => {
      if (node.type.name === 'footnoteRef') {
        const id = node.attrs.id as string
        if (id) refIds.push(id)
      }
      return true
    })

    const numbers = numberFootnotes(refIds)

    // Apply updated `number` attrs where needed.
    doc.descendants((node: PMNode, pos: number) => {
      if (node.type.name === 'footnoteRef') {
        const id = node.attrs.id as string
        const expected = numbers.get(id) ?? 1
        if (node.attrs.number !== expected) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, number: expected })
          modified = true
        }
      }
      return true
    })

    return modified ? tr : null
  },
})

// ── footnoteRef — inline atom node ────────────────────────────────────────

/**
 * footnoteRef — inline, atom node rendered as a superscript link.
 *
 * Attrs:
 *   id        — stable identifier that ties this ref to its footnoteItem.
 *   number    — 1-based display number (maintained by footnoteNumberingPlugin).
 *   placement — 'endnote' | 'footnote'. Both render at end-of-doc on screen;
 *               'footnote' is a print-time concern (see TODO below).
 */
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.dataset.fnId ?? '',
        renderHTML: (attrs) => ({ 'data-fn-id': String(attrs.id) }),
      },
      number: {
        default: 1,
        parseHTML: (el) => Number(el.dataset.fnNumber ?? 1),
        renderHTML: (attrs) => ({ 'data-fn-number': String(attrs.number) }),
      },
      placement: {
        default: 'endnote',
        parseHTML: (el) => el.dataset.fnPlacement ?? 'endnote',
        renderHTML: (attrs) => ({ 'data-fn-placement': String(attrs.placement) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-fn-id]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const id = String(node.attrs.id)
    const num = Number(node.attrs.number)
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'parchment-fn-ref' }),
      [
        'a',
        {
          href: `#fn-def-${id}`,
          id: `fnref-${id}`,
          'aria-label': `Footnote ${num}`,
          class: 'parchment-fn-ref-link',
        },
        String(num),
      ],
    ]
  },

  addProseMirrorPlugins() {
    return [footnoteNumberingPlugin]
  },
})

// ── footnoteItem — one editable definition inside the footnotes block ──────

/**
 * footnoteItem — holds the editable body text for one footnote.
 * Content: paragraph+ (at least one paragraph).
 * Attrs:
 *   id — matches the corresponding footnoteRef.id.
 */
export const FootnoteItem = Node.create({
  name: 'footnoteItem',
  group: 'footnoteItemContent',
  content: 'block+',

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.dataset.fnItemId ?? '',
        renderHTML: (attrs) => ({ 'data-fn-item-id': String(attrs.id) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li[data-fn-item-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes, { class: 'parchment-fn-item' }), 0]
  },
})

// ── footnotes — block container node, rendered via ReactNodeViewRenderer ──

/**
 * footnotes — a block node that lives (once) at the end of the document.
 * Content: footnoteItem+
 *
 * It is NOT atom — ProseMirror manages the inner content so each footnoteItem
 * remains editable.  The NodeView (FootnotesView) wraps the outer chrome
 * (header, border) as contentEditable=false, then exposes a NodeViewContent
 * div for ProseMirror to render the items into.
 *
 * Attrs:
 *   placement — 'endnote' | 'footnote' (screen: both render at end-of-doc).
 *
 * TODO (Plan H2 / paged.js): When `placement === 'footnote'`, the print CSS
 * should move the footnotes block to the page-footer region via CSS paged
 * media or paged.js `@footnote` support.  For now we annotate the block with
 * `data-fn-placement` so print CSS can target it, but screen rendering is
 * identical for both values.
 */
export const FootnotesBlock = Node.create({
  name: 'footnotes',
  group: 'block',
  content: 'footnoteItem+',

  addAttributes() {
    return {
      placement: {
        default: 'endnote',
        parseHTML: (el) => (el.dataset.fnPlacement as 'endnote' | 'footnote') ?? 'endnote',
        renderHTML: (attrs) => ({ 'data-fn-placement': String(attrs.placement) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'ol[data-footnotes]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'ol',
      mergeAttributes(HTMLAttributes, { 'data-footnotes': '', class: 'parchment-fn-list' }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnotesView)
  },

  addCommands() {
    return {
      insertFootnote:
        (opts?: { placement?: 'endnote' | 'footnote' }) =>
        ({ state, dispatch }) => {
          const placement = opts?.placement ?? 'endnote'
          const id = nextFootnoteId()
          const { schema, doc, tr } = state

          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const refType = schema.nodes['footnoteRef']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const itemType = schema.nodes['footnoteItem']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const footnotesType = schema.nodes['footnotes']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const paraType = schema.nodes['paragraph']
          if (!refType || !itemType || !footnotesType || !paraType) return false

          const refNode = refType.create({ id, number: 1, placement })

          // Find or create the footnotes block.
          let footnotesPos: number | null = null
          doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name === 'footnotes') {
              footnotesPos = pos
              return false
            }
            return true
          })

          const itemNode = itemType.create({ id }, paraType.create())

          if (footnotesPos === null) {
            // No footnotes block yet — append one at the end.
            const footnotesNode = footnotesType.create({ placement }, [itemNode])
            tr.insert(tr.doc.content.size, footnotesNode)
          } else {
            // Append the new item inside the existing footnotes block.
            const footnotesNode = doc.nodeAt(footnotesPos)
            if (!footnotesNode) return false
            const insertAt = footnotesPos + footnotesNode.nodeSize - 1
            tr.insert(insertAt, itemNode)
          }

          // Insert the ref at the current cursor.
          tr.insert(state.selection.from, refNode)

          if (dispatch) dispatch(tr)
          return true
        },
    }
  },

  addInputRules() {
    // Typing [^label] inserts a footnote ref (the label is ignored; we use
    // our own stable id). Pattern matches [^word-chars].
    return [
      new InputRule({
        find: /\[\^[^\]]+\]$/,
        handler: ({ state, range, chain }) => {
          const id = nextFootnoteId()
          const { schema, doc } = state

          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const refType = schema.nodes['footnoteRef']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const itemType = schema.nodes['footnoteItem']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const footnotesType = schema.nodes['footnotes']
          // biome-ignore lint/complexity/useLiteralKeys: bracket notation needed for noUncheckedIndexedAccess guard
          const paraType = schema.nodes['paragraph']
          if (!refType || !itemType || !footnotesType || !paraType) return null

          const refNode = refType.create({ id, number: 1 })
          const itemNode = itemType.create({ id }, paraType.create())

          // Determine whether a footnotes block already exists.
          let footnotesPos: number | null = null
          doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name === 'footnotes') {
              footnotesPos = pos
              return false
            }
            return true
          })

          if (footnotesPos === null) {
            // Delete the typed text, insert ref, then append a new footnotes block.
            const footnotesNode = footnotesType.create({}, [itemNode])
            chain()
              .command(({ tr }) => {
                tr.delete(range.from, range.to)
                tr.insert(range.from, refNode)
                return true
              })
              .command(({ tr }) => {
                tr.insert(tr.doc.content.size, footnotesNode)
                return true
              })
              .run()
          } else {
            // Append item to existing footnotes block.
            // Capture in a local const so the closure captures a non-null value.
            const capturedPos = footnotesPos
            const footnotesNode = doc.nodeAt(capturedPos)
            chain()
              .command(({ tr }) => {
                tr.delete(range.from, range.to)
                tr.insert(range.from, refNode)
                return true
              })
              .command(({ tr }) => {
                if (!footnotesNode) return false
                const insertAt = capturedPos + footnotesNode.nodeSize - 1
                tr.insert(insertAt, itemNode)
                return true
              })
              .run()
          }

          return null
        },
      }),
    ]
  },
})
