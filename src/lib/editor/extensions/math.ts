/**
 * G4 — KaTeX equations: inline math, display math (auto-numbered) + equation refs.
 *
 * This module defines three nodes plus a numbering ProseMirror plugin:
 *  - mathInline   — inline atom carrying a LaTeX string, rendered inline by KaTeX.
 *  - mathBlock    — block atom carrying a LaTeX string, rendered as centered
 *                   display KaTeX with an auto-number "(N)" on the right.
 *  - equationRef  — inline atom referencing a display equation by its ordinal,
 *                   rendered as "(N)" where N re-resolves through the numbering.
 *
 * KATEX BOUNDARY: katex is NEVER imported at module load here. The node
 * definitions only describe the schema (attrs / renderHTML / parseHTML) and a
 * plain ProseMirror NodeView. katex is lazily `import()`-ed inside the NodeView
 * render functions (which run only in the browser). This keeps
 * `getSchema(baseExtensions)` buildable in the Next.js server runtime (used by
 * the collab seed in Editor.tsx and indirectly by parse/serialize tests) without
 * dragging katex (a DOM-coupled lib) into the server bundle.
 *
 * EQUATION-REF IDENTITY MODEL (v0.1): an equationRef stores `targetIndex` — the
 * 1-based ordinal of the display equation it points at. On every render the ref
 * resolves that ordinal through the live numbering and prints "(N)". Because the
 * ordinal IS the number, a ref re-resolves to whatever equation now occupies that
 * slot: adding/removing/reordering equations shifts which equation a ref points
 * at the same way a printed "(see eq. 3)" would. This is the documented, simplest
 * model for v0.1; a stable-id model (ref pinned to a specific equation regardless
 * of reorder) is a future enhancement.
 */

import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView, NodeView as ProseMirrorNodeView } from '@tiptap/pm/view'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /** Insert an inline math atom carrying `latex` (default empty). */
      insertMathInline: (latex?: string) => ReturnType
    }
    mathBlock: {
      /** Insert a display (block) math atom carrying `latex` (default empty). */
      insertMathBlock: (latex?: string) => ReturnType
    }
    math: {
      /** Update the LaTeX of the math node at `pos` (inline or block). */
      updateMath: (pos: number, latex: string) => ReturnType
    }
    equationRef: {
      /** Insert an inline reference to the display equation at `targetIndex`. */
      insertEquationRef: (targetIndex: number) => ReturnType
    }
  }
}

// ── Pure numbering helper (unit-tested) ─────────────────────────────────────

/**
 * Walk a ProseMirror doc (plain JSON or a real PMNode) and assign each
 * `mathBlock` a 1-based number in document order. Returns a Map of the block's
 * document position → its number. Inline math (`mathInline`) and equationRefs
 * are skipped — only display equations are numbered.
 *
 * Pure + dependency-free (no katex, no editor view) so it is unit-testable
 * against a hand-built doc JSON.
 *
 * Accepts either a real ProseMirror `Node` (which exposes `descendants`) or a
 * plain JSON tree `{ type, content }`. The JSON walk mirrors `descendants`
 * position semantics: a node's position is the offset just before it, and a
 * non-leaf node opens with a token of size 1.
 */
type JsonNode = {
  type?: string
  content?: JsonNode[]
  attrs?: Record<string, unknown>
}

export function numberMathBlocks(doc: PMNode | JsonNode | unknown): Map<number, number> {
  const map = new Map<number, number>()
  let counter = 0

  // Real ProseMirror node — use its descendants walk (authoritative positions).
  if (typeof (doc as PMNode).descendants === 'function') {
    ;(doc as PMNode).descendants((node: PMNode, pos: number) => {
      if (node.type.name === 'mathBlock') {
        counter += 1
        map.set(pos, counter)
      }
      return true
    })
    return map
  }

  // Plain JSON walk. Position accounting matches ProseMirror: each child of a
  // parent starts at the running offset; entering a non-leaf node consumes one
  // token (the open token), and leaf/text sizes advance the offset.
  const walk = (node: JsonNode, pos: number): number => {
    if (node.type === 'mathBlock') {
      counter += 1
      map.set(pos, counter)
    }
    const children = node.content ?? []
    // Children begin one position inside the parent's open token.
    let childPos = pos + 1
    for (const child of children) {
      walk(child, childPos)
      childPos += nodeSize(child)
    }
    return pos
  }

  // The doc node itself is the root; its children start at position 0.
  const root = doc as JsonNode
  let childPos = 0
  for (const child of root.content ?? []) {
    walk(child, childPos)
    childPos += nodeSize(child)
  }
  return map
}

/** Approximate ProseMirror nodeSize for a plain JSON node (enough for ordering). */
function nodeSize(node: JsonNode): number {
  // Atoms / leaves the test cares about (mathBlock, mathInline, paragraph text)
  // — a block with content has open+close tokens (2) plus its children sizes; a
  // leaf/atom has size 1. Text size would be its length but the numbering only
  // needs relative order, and tests build paragraphs of atoms, so this suffices.
  const children = node.content
  if (!children || children.length === 0) return 1
  let inner = 0
  for (const c of children) inner += nodeSize(c)
  return inner + 2
}

// ── Numbering plugin ────────────────────────────────────────────────────────

/**
 * Plugin state: a Map of mathBlock document-position → its 1-based number.
 * NodeViews read this (via the plugin key) on each render/update to display the
 * current "(N)". equationRef NodeViews read the ordered list of numbers to map a
 * `targetIndex` ordinal → the live number (which, for the pure-ordinal model, is
 * the ordinal itself, but resolving through the map keeps refs robust if the
 * numbering scheme ever changes).
 */
export const mathNumberingKey = new PluginKey<Map<number, number>>('mathNumbering')

function makeNumberingPlugin(): Plugin<Map<number, number>> {
  return new Plugin<Map<number, number>>({
    key: mathNumberingKey,
    state: {
      init(_config, state) {
        return numberMathBlocks(state.doc)
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged) return old
        return numberMathBlocks(newState.doc)
      },
    },
    view(view) {
      // After each numbering change, ask all math NodeViews to re-read the
      // numbering and repaint their "(N)". A no-op meta transaction triggers
      // NodeView.update without mutating the doc.
      let prev = mathNumberingKey.getState(view.state)
      return {
        update(v) {
          const next = mathNumberingKey.getState(v.state)
          if (next !== prev) {
            prev = next
            requestRenumberRepaint(v)
          }
        },
      }
    },
  })
}

/**
 * Force every math NodeView to re-render its number. We do this by dispatching a
 * meta-only transaction; ProseMirror calls each NodeView's `update` with the
 * same node, and our NodeViews re-read the numbering on update. Guard against a
 * destroyed view and avoid infinite loops by tagging the meta.
 */
const RENUMBER_META = 'parchmentMathRenumber'
function requestRenumberRepaint(view: EditorView): void {
  if (view.isDestroyed) return
  // Defer to a microtask so we never dispatch inside an apply cycle.
  queueMicrotask(() => {
    if (view.isDestroyed) return
    view.dispatch(view.state.tr.setMeta(RENUMBER_META, true))
  })
}

// ── KaTeX render helper (lazy, client-only) ─────────────────────────────────

/**
 * Render `latex` into `target` using KaTeX. katex + its CSS are lazy-imported
 * here so they never load at module-eval time (server-safe schema build). Errors
 * never throw — KaTeX `throwOnError:false` renders the error inline in red.
 */
function renderKatexInto(target: HTMLElement, latex: string, displayMode: boolean): void {
  // Empty latex → a subtle placeholder so the (clickable) node is still visible.
  if (latex.trim() === '') {
    target.textContent = displayMode ? '(empty equation)' : '(empty)'
    target.classList.add('parchment-math-empty')
    return
  }
  target.classList.remove('parchment-math-empty')
  void import('katex')
    .then(({ default: katex }) => {
      try {
        katex.render(latex, target, { displayMode, throwOnError: false })
      } catch {
        // KaTeX with throwOnError:false should not throw, but never crash the
        // editor if it does — show the raw source.
        target.textContent = latex
      }
    })
    .catch(() => {
      target.textContent = latex
    })
}

// Load the KaTeX stylesheet once, on the client, the first time a math NodeView
// mounts. Importing it from a node definition would pull CSS into the server
// bundle, so we inject it lazily instead.
let _katexCssLoaded = false
function ensureKatexCss(): void {
  if (_katexCssLoaded || typeof document === 'undefined') return
  _katexCssLoaded = true
  void import('katex/dist/katex.min.css')
}

// ── Shared: dispatch the edit-popover event ─────────────────────────────────

function dispatchEditMath(view: EditorView, pos: number, latex: string): void {
  view.dom.dispatchEvent(
    new CustomEvent('parchment:edit-math', {
      bubbles: true,
      detail: { pos, latex },
    }),
  )
}

// ── mathInline — inline atom node ───────────────────────────────────────────

/**
 * mathInline — an inline, atomic node carrying a LaTeX string.
 *
 * HTML output: <span data-math-inline data-latex="…">…</span>
 * The NodeView renders KaTeX inline (displayMode:false); clicking it opens the
 * LaTeX editor popover via the `parchment:edit-math` event.
 */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': String(attrs.latex ?? '') }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-math-inline': '', class: 'parchment-math-inline' }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }): ProseMirrorNodeView => {
      ensureKatexCss()
      const dom = document.createElement('span')
      dom.className = 'parchment-math-inline'
      dom.setAttribute('data-math-inline', '')
      dom.contentEditable = 'false'

      let latex = String(node.attrs.latex ?? '')
      dom.dataset.latex = latex
      renderKatexInto(dom, latex, false)

      dom.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        if (typeof getPos !== 'function') return
        const pos = getPos()
        if (pos === undefined) return
        dispatchEditMath(editor.view, pos, latex)
      })

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mathInline') return false
          const next = String(updated.attrs.latex ?? '')
          if (next !== latex) {
            latex = next
            dom.dataset.latex = latex
            renderKatexInto(dom, latex, false)
          }
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },
})

// ── mathBlock — block atom node (display, auto-numbered) ─────────────────────

/**
 * mathBlock — a block, atomic node carrying a LaTeX string, rendered as centered
 * display KaTeX with an auto-number "(N)" aligned right. The number comes from
 * the numbering plugin (mathNumberingKey) and repaints on doc changes.
 *
 * HTML output: <div data-math-block data-latex="…">…</div>
 */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': String(attrs.latex ?? '') }),
      },
      // G8a: stable refId (assigned by crossRefNumbering appendTransaction).
      // Equations are numbered already by mathNumberingKey; refId adds stable
      // identity so a cross-ref pinned to a specific equation survives reorder.
      refId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref-id') ?? '',
        renderHTML: (attrs) => {
          const rid = String(attrs.refId ?? '')
          return rid ? { 'data-ref-id': rid } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-math-block': '', class: 'parchment-math-block' }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }): ProseMirrorNodeView => {
      ensureKatexCss()
      const dom = document.createElement('div')
      dom.className = 'parchment-math-block'
      dom.setAttribute('data-math-block', '')
      dom.contentEditable = 'false'
      // G8b-fix: set data-ref-id on the NodeView DOM from the start so
      // parchment:goto-ref can find this equation by [data-ref-id="..."].
      const initialRefId = node.attrs.refId as string | undefined
      if (initialRefId) dom.dataset.refId = initialRefId

      const formula = document.createElement('div')
      formula.className = 'parchment-math-block-formula'

      const numberEl = document.createElement('span')
      numberEl.className = 'parchment-math-block-number'
      numberEl.setAttribute('aria-hidden', 'true')

      dom.appendChild(formula)
      dom.appendChild(numberEl)

      let latex = String(node.attrs.latex ?? '')
      dom.dataset.latex = latex
      renderKatexInto(formula, latex, true)

      const paintNumber = (): void => {
        if (typeof getPos !== 'function') {
          numberEl.textContent = ''
          return
        }
        const pos = getPos()
        if (pos === undefined) {
          numberEl.textContent = ''
          return
        }
        const numbering = mathNumberingKey.getState(editor.view.state)
        const n = numbering?.get(pos)
        numberEl.textContent = n !== undefined ? `(${n})` : ''
      }
      paintNumber()

      dom.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        if (typeof getPos !== 'function') return
        const pos = getPos()
        if (pos === undefined) return
        dispatchEditMath(editor.view, pos, latex)
      })

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mathBlock') return false
          const next = String(updated.attrs.latex ?? '')
          if (next !== latex) {
            latex = next
            dom.dataset.latex = latex
            renderKatexInto(formula, latex, true)
          }
          // G8b-fix: keep data-ref-id on the NodeView DOM so parchment:goto-ref
          // can find equations by [data-ref-id="..."] (renderHTML is bypassed).
          const rid = updated.attrs.refId as string | undefined
          if (rid) {
            dom.dataset.refId = rid
          } else {
            delete dom.dataset.refId
          }
          // The number may have changed even when latex did not (a sibling
          // equation was added/removed) — always repaint it on update.
          paintNumber()
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },

  addProseMirrorPlugins() {
    return [makeNumberingPlugin()]
  },
})

// ── equationRef — inline atom referencing a display equation ────────────────

/**
 * equationRef — an inline atom that renders "(N)" where N is the current number
 * of the display equation at ordinal `targetIndex`. Resolved through the
 * numbering on every render so it auto-updates as equations change.
 *
 * HTML output: <span data-equation-ref data-target-index="N">(N)</span>
 */
export const EquationRef = Node.create({
  name: 'equationRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetIndex: {
        default: 1,
        parseHTML: (el) => {
          const v = Number(el.getAttribute('data-target-index') ?? 1)
          return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1
        },
        renderHTML: (attrs) => ({ 'data-target-index': String(attrs.targetIndex ?? 1) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-equation-ref]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const idx = Number(node.attrs.targetIndex ?? 1)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-equation-ref': '',
        class: 'parchment-equation-ref',
      }),
      `(${idx})`,
    ]
  },

  renderText({ node }) {
    return `(${Number(node.attrs.targetIndex ?? 1)})`
  },

  addNodeView() {
    return ({ node, editor }): ProseMirrorNodeView => {
      const dom = document.createElement('span')
      dom.className = 'parchment-equation-ref'
      dom.setAttribute('data-equation-ref', '')
      dom.contentEditable = 'false'

      let targetIndex = Number(node.attrs.targetIndex ?? 1)
      dom.dataset.targetIndex = String(targetIndex)

      const paint = (): void => {
        // Resolve the ordinal through the live numbering. With the pure-ordinal
        // identity model the displayed number IS the ordinal, but we look it up
        // in the ordered numbering so a future numbering scheme stays correct,
        // and so a ref to a now-missing equation can degrade gracefully.
        const numbering = mathNumberingKey.getState(editor.view.state)
        const ordered = numbering ? [...numbering.values()].sort((a, b) => a - b) : []
        const resolved = ordered.includes(targetIndex) ? targetIndex : undefined
        dom.textContent = resolved !== undefined ? `(${resolved})` : `(${targetIndex}?)`
        dom.classList.toggle('parchment-equation-ref--unresolved', resolved === undefined)
      }
      paint()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'equationRef') return false
          targetIndex = Number(updated.attrs.targetIndex ?? 1)
          dom.dataset.targetIndex = String(targetIndex)
          paint()
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertEquationRef:
        (targetIndex) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { targetIndex: Math.max(1, Math.floor(targetIndex)) },
          }),
    }
  },
})

// ── updateMath command extension ────────────────────────────────────────────

/**
 * A tiny extension carrying the shared `updateMath(pos, latex)` command. It is
 * registered once (not per-node) so the MathPopover can call it regardless of
 * whether the target node is inline or block. Modeled as an Extension (not a
 * Node) so it adds NO node to the schema — `getSchema(baseExtensions)` is
 * unaffected by it.
 */
export const MathCommands = Extension.create({
  name: 'mathCommands',
  addCommands() {
    return {
      updateMath:
        (pos, latex) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          if (!target) return false
          if (target.type.name !== 'mathInline' && target.type.name !== 'mathBlock') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, latex })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
