/**
 * G8a — Cross-reference numbering plugin + stable refId assignment.
 *
 * TWO HARD-WON LESSONS honoured here:
 *   1. Rebuild plugin state ONLY on tr.docChanged — never on a self-dispatched
 *      repaint meta, which creates an infinite loop that pegs the renderer
 *      (the exact G7 bug).
 *   2. NodeViews whose display depends on a DIFFERENT node must subscribe via
 *      useEditorState (React) or the NodeView's update() callback — reading
 *      plugin state once at render goes stale (the exact G7 CitationView bug).
 *
 * Plugin key is exported so G8b's crossRef NodeView can read the map.
 */

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { CrossRefTarget } from '@/lib/editor/cross-ref'
import { collectCrossRefTargets, indexTargets } from '@/lib/editor/cross-ref'

// ── Plugin key (exported for G8b consumers) ──────────────────────────────────

export const crossRefNumberingKey = new PluginKey<Map<string, CrossRefTarget>>('crossRefNumbering')

// ── Repaint meta sentinel ─────────────────────────────────────────────────────

const CROSSREF_REPAINT_META = 'parchmentCrossRefRepaint'

function requestRepaint(view: EditorView): void {
  if (view.isDestroyed) return
  queueMicrotask(() => {
    if (view.isDestroyed) return
    view.dispatch(view.state.tr.setMeta(CROSSREF_REPAINT_META, true))
  })
}

// ── Numbering plugin ──────────────────────────────────────────────────────────

function makeNumberingPlugin(): Plugin<Map<string, CrossRefTarget>> {
  return new Plugin<Map<string, CrossRefTarget>>({
    key: crossRefNumberingKey,
    state: {
      init(_config, state) {
        const targets = collectCrossRefTargets(state.doc)
        return indexTargets(targets)
      },
      apply(tr, old, _oldState, newState) {
        // LESSON 1: only rebuild on an actual doc change. Repaint meta
        // transactions (dispatched by the view() below) must NOT trigger a
        // rebuild or we enter an infinite loop.
        if (!tr.docChanged) return old
        const targets = collectCrossRefTargets(newState.doc)
        return indexTargets(targets)
      },
    },
    view(view) {
      let prev = crossRefNumberingKey.getState(view.state)
      return {
        update(v) {
          const next = crossRefNumberingKey.getState(v.state)
          if (next !== prev) {
            prev = next
            requestRepaint(v)
          }
        },
      }
    },
  })
}

// ── Stable refId assignment (appendTransaction) ───────────────────────────────

/**
 * Generate a stable unique refId. crypto.randomUUID() is available in
 * browsers (client) and in Node 19+. Guard for SSR edge cases.
 */
let _refCounter = 0
function generateRefId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  // SSR fallback (should only happen in tests / server — the editor always
  // runs in the browser where randomUUID is available).
  _refCounter += 1
  return `${prefix}-${Date.now()}-${_refCounter}`
}

/** Node types that receive a stable refId (headings reuse their `id`). */
const REFID_NODES = new Set(['image', 'mathBlock', 'table'])

/**
 * Validate that an existing refId was produced by generateRefId, not a junk
 * string. A valid refId has the form `<prefix>-<content>` where prefix is one
 * of the three known prefixes and content is non-empty. This prevents a node
 * serialized with a corrupted or hand-written attr from being accepted as-is
 * and never reassigned — the G8-crossref idempotency edge case.
 */
const VALID_REFID_RE = /^(?:fig|tbl|eq)-\S+$/
function isValidRefId(v: string | undefined | null): boolean {
  return typeof v === 'string' && VALID_REFID_RE.test(v)
}

function makeRefIdPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('crossRefAssignRefId'),
    appendTransaction(_transactions, _oldState, newState) {
      const { doc, tr } = newState
      let modified = false

      doc.descendants((node: PMNode, pos: number) => {
        if (!REFID_NODES.has(node.type.name)) return true
        const existing = node.attrs.refId as string | undefined | null
        if (isValidRefId(existing)) return true

        // Assign a stable refId
        const prefix =
          node.type.name === 'image' ? 'fig' : node.type.name === 'table' ? 'tbl' : 'eq'
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          refId: generateRefId(prefix),
        })
        modified = true
        return true
      })

      return modified ? tr : null
    },
  })
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const CrossRefNumberingExtension = Extension.create({
  name: 'crossRefNumbering',

  addProseMirrorPlugins() {
    return [makeNumberingPlugin(), makeRefIdPlugin()]
  },
})
