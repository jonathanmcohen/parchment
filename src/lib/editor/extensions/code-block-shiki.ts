/**
 * CodeBlockShiki — Tiptap extension (C3/C4/C5/C6/C7).
 *
 * Extends the base CodeBlock node with:
 *  - Attributes: `language`, `theme`, `showLineNumbers`, `highlightLines`,
 *    `filename`, `collapsed` (all persisted as data-* attributes).
 *  - A ProseMirror decoration plugin that:
 *      • Syntax-highlights code with Shiki inline token colours (C3/C4).
 *      • Renders a line-number widget at each line start when showLineNumbers
 *        is true (C5) — Decoration.widget with side:-1.
 *      • Applies a left-border line-highlight decoration for lines in the
 *        highlightLines spec (C5) — Decoration.inline with class.
 *      • Applies diff-add / diff-del inline decorations for `diff` language
 *        blocks (C7) — overrides token colours with green/red bg classes.
 *  - A ReactNodeViewRenderer (CodeBlockView) for the header chrome: filename
 *    caption, copy button, collapse toggle, line-number toggle, highlight-lines
 *    input (C5/C6).
 *
 * Decoration strategy:
 *  The plugin walks each line's character range (from→to). For each line:
 *    1. Token colour spans (Shiki) — Decoration.inline per token.
 *    2. Line-number widget — Decoration.widget at line start (side:-1).
 *    3. Line highlight — Decoration.inline over the full line range (class only).
 *    4. Diff kind — Decoration.inline over the full line range (class only).
 *
 * The NodeView (CodeBlockView) renders a wrapper div > header + pre > code.
 * The <code> element is the NodeViewContent target so decorations apply inside
 * the editable code. The <pre> preserves .parchment-prose pre styles.
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
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { BundledLanguage, BundledTheme } from 'shiki'
import { CodeBlockView } from '@/components/editor/CodeBlockView'
import { diffLineKind, parseLineRanges } from '@/lib/editor/code-block-lines'
import { detectLanguage, MIN_CODE_CHARS } from '@/lib/editor/shiki/auto-detect'
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
 * Walk the document and build a DecorationSet with:
 *  - inline colour decorations (Shiki tokens)
 *  - line-number widgets (when showLineNumbers is true)
 *  - line-highlight inline decorations (when highlightLines is non-empty)
 *  - diff-add / diff-del inline decorations (when language === 'diff')
 *
 * For blocks whose language is not yet loaded this function fires
 * ensureLanguage() as a side-effect and registers a callback to re-decorate
 * via a no-op meta transaction once the grammar arrives.
 */
function buildDecorations(state: EditorState, view: EditorView | null): DecorationSet {
  const decorations: Decoration[] = []

  // We need the highlighter synchronously — if it's not ready yet, return empty.
  const hl = _resolvedHighlighter
  if (hl === null) {
    void _initHighlighter(view)
    return DecorationSet.empty
  }

  state.doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name !== 'codeBlock') return true

    const attrs = node.attrs as Record<string, unknown>
    const rawLang = attrs.language as string | undefined
    const rawTheme = attrs.theme as string | undefined
    const showLineNumbers = Boolean(attrs.showLineNumbers)
    const highlightLines = (attrs.highlightLines as string | undefined) ?? ''

    const lang = normalizeLang(rawLang)
    const theme: ShikiTheme =
      rawTheme !== undefined &&
      rawTheme !== null &&
      (SHIKI_THEMES as readonly string[]).includes(rawTheme)
        ? (rawTheme as ShikiTheme)
        : DEFAULT_THEME

    const highlightSet = parseLineRanges(highlightLines)
    const isDiff = lang === 'diff'

    if (lang === 'plaintext' || !isLanguageLoaded(lang)) {
      if (lang !== 'plaintext') {
        void ensureLanguage(lang).then((ok) => {
          if (ok && view !== null && !view.isDestroyed) {
            view.dispatch(view.state.tr.setMeta('shikiReady', true))
          }
        })
      }
      // Even without highlighting, we still apply structural decorations.
      applyStructuralDecorations(
        node,
        pos,
        null,
        showLineNumbers,
        highlightSet,
        isDiff,
        decorations,
      )
      return true
    }

    // Node position: pos points to the opening token of the codeBlock node.
    // The code content starts at pos + 1 (inside the node).
    const code = node.textContent

    let lines: { content: string; color?: string | undefined }[][]
    try {
      const tokens = hl.codeToTokensBase(code, {
        lang: lang as BundledLanguage,
        theme: theme as BundledTheme,
      })
      lines = tokens
    } catch {
      return true
    }

    applyAllDecorations(node, pos, lines, showLineNumbers, highlightSet, isDiff, decorations)

    return false
  })

  return DecorationSet.create(state.doc, decorations)
}

/**
 * Apply token colour decorations + structural decorations for a fully-loaded
 * language block where we have Shiki token data.
 */
function applyAllDecorations(
  _node: PMNode,
  pos: number,
  lines: { content: string; color?: string | undefined }[][],
  showLineNumbers: boolean,
  highlightSet: Set<number>,
  isDiff: boolean,
  decorations: Decoration[],
): void {
  const textStart = pos + 1
  let offset = textStart

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? []
    const lineNum = i + 1
    const lineFrom = offset

    // Token colour spans.
    for (const token of line) {
      const from = offset
      const to = from + token.content.length
      if (token.color !== undefined && token.color !== null && token.color !== '') {
        decorations.push(Decoration.inline(from, to, { style: `color: ${token.color}` }))
      }
      offset = to
    }

    const lineTo = offset
    // Account for the newline character between lines.
    offset += 1

    pushStructuralDecs(
      lineFrom,
      lineTo,
      lineNum,
      showLineNumbers,
      highlightSet,
      isDiff,
      line,
      decorations,
    )
  }
}

/**
 * Apply structural decorations only (line numbers, line highlight, diff) when
 * we have no Shiki token data (plaintext / lang not yet loaded).
 */
function applyStructuralDecorations(
  node: PMNode,
  pos: number,
  _lines: null,
  showLineNumbers: boolean,
  highlightSet: Set<number>,
  isDiff: boolean,
  decorations: Decoration[],
): void {
  if (!showLineNumbers && highlightSet.size === 0 && !isDiff) return

  const textStart = pos + 1
  const code = node.textContent
  const rawLines = code.split('\n')
  let offset = textStart

  for (let i = 0; i < rawLines.length; i++) {
    const lineStr = rawLines[i] ?? ''
    const lineNum = i + 1
    const lineFrom = offset
    const lineTo = offset + lineStr.length
    offset = lineTo + 1 // +1 for newline

    // Build a fake single-token line for diff detection.
    const fakeLine = [{ content: lineStr }]
    pushStructuralDecs(
      lineFrom,
      lineTo,
      lineNum,
      showLineNumbers,
      highlightSet,
      isDiff,
      fakeLine,
      decorations,
    )
  }
}

/**
 * Shared helper: push line-number widget + line-highlight + diff decorations
 * for a single line given its character range [lineFrom, lineTo).
 */
function pushStructuralDecs(
  lineFrom: number,
  lineTo: number,
  lineNum: number,
  showLineNumbers: boolean,
  highlightSet: Set<number>,
  isDiff: boolean,
  line: { content: string }[],
  decorations: Decoration[],
): void {
  // 1. Line-number widget (C5).
  if (showLineNumbers) {
    const lineNumCapture = lineNum
    decorations.push(
      Decoration.widget(
        lineFrom,
        () => {
          const span = document.createElement('span')
          span.className = 'parchment-cb-linenum'
          span.textContent = String(lineNumCapture)
          span.setAttribute('aria-hidden', 'true')
          return span
        },
        { side: -1 },
      ),
    )
  }

  // 2. Line highlight (C5) — skip if line has no content (avoid 0-length inline).
  if (highlightSet.has(lineNum) && lineTo > lineFrom) {
    decorations.push(Decoration.inline(lineFrom, lineTo, { class: 'parchment-cb-line-hl' }))
  }

  // 3. Diff line kind (C7).
  if (isDiff && lineTo > lineFrom) {
    // Reconstruct the line string from the first token's content prefix.
    const lineStr = line.map((t) => t.content).join('')
    const kind = diffLineKind(lineStr)
    if (kind === 'add') {
      decorations.push(Decoration.inline(lineFrom, lineTo, { class: 'parchment-cb-diff-add' }))
    } else if (kind === 'del') {
      decorations.push(Decoration.inline(lineFrom, lineTo, { class: 'parchment-cb-diff-del' }))
    }
  }
}

// ── Highlighter cache ───────────────────────────────────────────────────────

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

// ── Auto-detect driver (P4) ──────────────────────────────────────────────────

/**
 * A half-open range [from, to) in document positions.
 */
export interface ChangedRange {
  from: number
  to: number
}

/**
 * A codeBlock node eligible for language auto-detection.
 */
export interface AutoDetectTarget {
  /** Document position of the codeBlock node (points at its opening token). */
  pos: number
  /** The node's text content. */
  text: string
}

/** Debounce window (ms) before running auto-detection after the last edit. */
const AUTO_DETECT_DEBOUNCE_MS = 400

/**
 * Pure candidate-selection logic (P4 / churn-safety).
 *
 * Walks `doc` and returns every codeBlock node that:
 *   1. has `language` === null/undefined (i.e. "undetected/auto" — NOT an
 *      explicit choice, including not an explicit 'plaintext'), AND
 *   2. overlaps at least one of `changedRanges` (i.e. THIS transaction touched
 *      its text).
 *
 * Blocks loaded from disk and never edited produce no changed ranges, so they
 * are NEVER returned — that is the disk-mirror churn-safety guarantee. Blocks
 * with a concrete language are skipped so we never re-label an explicit choice.
 *
 * Ranges are expressed in the coordinate space of `doc` (i.e. the NEW doc after
 * the transaction, mapped through the step maps).
 */
export function collectAutoDetectTargets(
  doc: PMNode,
  changedRanges: readonly ChangedRange[],
): AutoDetectTarget[] {
  if (changedRanges.length === 0) return []

  const targets: AutoDetectTarget[] = []

  doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name !== 'codeBlock') return true

    const lang = (node.attrs as Record<string, unknown>).language
    // Only auto-detect "undetected" blocks. A concrete string (incl. 'plaintext')
    // means the user made an explicit choice — leave it alone.
    if (lang !== null && lang !== undefined) return false

    // Node occupies [pos, pos + nodeSize) in doc positions.
    const nodeFrom = pos
    const nodeTo = pos + node.nodeSize
    const touched = changedRanges.some((range) => range.from < nodeTo && range.to > nodeFrom)
    if (touched) {
      targets.push({ pos, text: node.textContent })
    }
    // Code blocks don't contain other code blocks — no need to descend.
    return false
  })

  return targets
}

/**
 * Collect the ranges in the NEW document that a transaction changed, by walking
 * its step maps. Each map's `forEach` yields (oldStart, oldEnd, newStart, newEnd);
 * we keep the NEW-doc range [newStart, newEnd). To express every range in the
 * final document's coordinate space we map each new range forward through the
 * remaining step maps.
 */
function changedRangesFromTransaction(tr: Transaction): ChangedRange[] {
  const ranges: ChangedRange[] = []
  const maps = tr.mapping.maps
  for (let i = 0; i < maps.length; i++) {
    const map = maps[i]
    if (map === undefined) continue
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      // Map this new range forward through the steps that came after step i so
      // it lands in the final doc's coordinate space.
      const slice = tr.mapping.slice(i + 1)
      ranges.push({ from: slice.map(newStart, -1), to: slice.map(newEnd, 1) })
    })
  }
  return ranges
}

/**
 * Run one auto-detection pass over the current view's doc, restricted to the
 * given candidate targets. For each candidate with >= MIN_CODE_CHARS non-space
 * chars whose detectLanguage returns a CONCRETE language (not 'plaintext'),
 * dispatch ONE transaction setting the `language` attr. The transaction is
 * marked `addToHistory: false` and `autoDetect: true`, and re-validates each
 * candidate against the live doc (positions may have shifted, the block may have
 * been deleted, or the user may have set a language in the meantime).
 */
function runAutoDetect(view: EditorView, targets: readonly AutoDetectTarget[]): void {
  if (view.isDestroyed || targets.length === 0) return

  const { state } = view
  let tr = state.tr
  let changed = false

  for (const target of targets) {
    const nonSpace = target.text.replace(/\s/g, '')
    if (nonSpace.length < MIN_CODE_CHARS) continue

    // Re-validate the node still exists at this position, is a codeBlock, still
    // has null language, and still holds the text we detected against.
    const node = state.doc.nodeAt(target.pos)
    if (node === null || node.type.name !== 'codeBlock') continue
    const lang = (node.attrs as Record<string, unknown>).language
    if (lang !== null && lang !== undefined) continue
    if (node.textContent !== target.text) continue

    const detected = detectLanguage(target.text)
    // Never persist 'plaintext' from auto-detection — leave null so a later edit
    // retries detection once there's more signal.
    if (detected.language === 'plaintext') continue

    tr = tr.setNodeAttribute(target.pos, 'language', detected.language)
    changed = true
  }

  if (!changed || view.isDestroyed) return
  tr.setMeta('addToHistory', false)
  tr.setMeta('autoDetect', true)
  view.dispatch(tr)
}

// ── ProseMirror plugin ─────────────────────────────────────────────────────

function makeShikiPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: shikiPluginKey,

    state: {
      init(_config, _state) {
        return DecorationSet.empty
      },

      apply(tr, old, _oldState, newState) {
        // P4: feed the debounced auto-detect driver. Only react to genuine doc
        // edits (skip our own marker transactions to avoid a detect→detect loop).
        if (tr.docChanged && tr.getMeta('autoDetect') !== true) {
          const ranges = changedRangesFromTransaction(tr)
          const candidates = collectAutoDetectTargets(newState.doc, ranges)
          if (candidates.length > 0) {
            _autoDetectDriver?.enqueue(candidates)
          }
        }
        if (!tr.docChanged && tr.getMeta('shikiReady') === undefined) {
          return old
        }
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
      void _initHighlighter(editorView)
      _autoDetectDriver = createAutoDetectDriver(editorView)
      return {
        destroy() {
          _autoDetectDriver?.destroy()
          _autoDetectDriver = null
          _currentView = null
        },
      }
    },
  })
}

let _currentView: EditorView | null = null

// ── Debounced auto-detect driver (P4) ────────────────────────────────────────

interface AutoDetectDriver {
  /** Queue candidate code blocks and (re)arm the debounce timer. */
  enqueue(candidates: readonly AutoDetectTarget[]): void
  destroy(): void
}

let _autoDetectDriver: AutoDetectDriver | null = null

/**
 * Build the debounced driver bound to a single EditorView. Candidates are
 * coalesced by node position; the actual text is re-read from the live doc when
 * the timer fires, so positions/edits that landed during the debounce window are
 * validated by runAutoDetect. The timer is cleared on view destroy.
 */
function createAutoDetectDriver(view: EditorView): AutoDetectDriver {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Coalesce by position; text is re-derived at fire time from the live doc.
  let pendingPositions = new Set<number>()

  const fire = (): void => {
    timer = null
    const positions = pendingPositions
    pendingPositions = new Set()
    if (view.isDestroyed || positions.size === 0) return
    const targets: AutoDetectTarget[] = []
    for (const pos of positions) {
      const node = view.state.doc.nodeAt(pos)
      if (node !== null && node.type.name === 'codeBlock') {
        targets.push({ pos, text: node.textContent })
      }
    }
    runAutoDetect(view, targets)
  }

  return {
    enqueue(candidates) {
      for (const c of candidates) pendingPositions.add(c.pos)
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(fire, AUTO_DETECT_DEBOUNCE_MS)
    },
    destroy() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pendingPositions = new Set()
    },
  }
}

// ── Tiptap extension ────────────────────────────────────────────────────────

export const CodeBlockShiki = CodeBlock.extend({
  name: 'codeBlock',

  addAttributes() {
    return {
      // ── Inherited from C3/C4 ───────────────────────────────────────────
      language: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-language') ?? null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const lang = attributes.language as string | null | undefined
          if (!lang) return {}
          return { 'data-language': lang, class: `language-${lang}` }
        },
      },
      theme: {
        default: DEFAULT_THEME,
        parseHTML: (element) => element.getAttribute('data-theme') ?? DEFAULT_THEME,
        renderHTML: (attributes: Record<string, unknown>) => {
          const theme = attributes.theme as string | undefined
          return { 'data-theme': theme ?? DEFAULT_THEME }
        },
      },
      // ── New C5/C6 attrs ────────────────────────────────────────────────
      showLineNumbers: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-line-numbers') === 'true',
        renderHTML: (attributes: Record<string, unknown>) => {
          const v = attributes.showLineNumbers
          return v ? { 'data-line-numbers': 'true' } : {}
        },
      },
      highlightLines: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-highlight-lines') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => {
          const v = attributes.highlightLines as string | undefined
          return v ? { 'data-highlight-lines': v } : {}
        },
      },
      filename: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-filename') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => {
          const v = attributes.filename as string | undefined
          return v ? { 'data-filename': v } : {}
        },
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes: Record<string, unknown>) => {
          const v = attributes.collapsed
          return v ? { 'data-collapsed': 'true' } : {}
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },

  addProseMirrorPlugins() {
    return [makeShikiPlugin()]
  },
})
