import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type FindOptions, findMatches, type Match } from '@/lib/editor/find'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      /** Set the active query and options; rebuilds decorations. */
      setFindQuery: (
        query: string,
        opts?: FindOptions & { scope?: 'doc' | 'selection' },
      ) => ReturnType
      /** Advance to the next match (wraps around). */
      findNext: () => ReturnType
      /** Go back to the previous match (wraps around). */
      findPrev: () => ReturnType
      /** Replace the active match with `replacement`. */
      replaceCurrent: (replacement: string) => ReturnType
      /** Replace all matches with `replacement`. */
      replaceAll: (replacement: string) => ReturnType
      /** Clear the find state and remove all decorations. */
      clearFind: () => ReturnType
    }
  }
}

// ── Plugin state ───────────────────────────────────────────────────────────

export interface FindState {
  query: string
  opts: FindOptions
  scope: 'doc' | 'selection'
  /** ProseMirror-position matches (absolute doc positions). */
  matches: Array<{ from: number; to: number }>
  activeIndex: number
  /** Validation error when regex is invalid. */
  error: string | null
  decorations: DecorationSet
}

const EMPTY_STATE: FindState = {
  query: '',
  opts: {},
  scope: 'doc',
  matches: [],
  activeIndex: 0,
  error: null,
  decorations: DecorationSet.empty,
}

const findReplaceKey = new PluginKey<FindState>('findReplace')

// ── Offset → PM position mapping ───────────────────────────────────────────

/**
 * Walk the doc between PM positions [rangeFrom, rangeTo] and collect every
 * text leaf.  Build a flat string and a segment map so any char offset back
 * into that string can be translated to an absolute PM position.
 *
 * ProseMirror `nodesBetween(from, to, cb)` visits all nodes whose content
 * overlaps [from, to].  `from` and `to` are positions *inside* the doc node
 * (i.e. 0-based relative to doc.content).  For the whole doc use
 * from=0, to=doc.content.size.
 */
function buildTextMap(
  doc: PmNode,
  rangeFrom: number,
  rangeTo: number,
): { text: string; mapOffsetToPos: (offset: number) => number } {
  const segments: Array<{ text: string; pmStart: number }> = []

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (!node.isText) return true

    // Clip the text node to [rangeFrom, rangeTo]
    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize // for text nodes nodeSize === text.length
    const sliceFrom = Math.max(rangeFrom, nodeStart)
    const sliceTo = Math.min(rangeTo, nodeEnd)
    if (sliceFrom >= sliceTo) return false

    const text = node.text?.slice(sliceFrom - nodeStart, sliceTo - nodeStart) ?? ''
    if (text) {
      segments.push({ text, pmStart: sliceFrom })
    }
    return false // text nodes have no children
  })

  // Build flat text and offset map
  const segMap: Array<{ charOffset: number; pmStart: number }> = []
  let charOffset = 0
  let fullText = ''
  for (const seg of segments) {
    segMap.push({ charOffset, pmStart: seg.pmStart })
    fullText += seg.text
    charOffset += seg.text.length
  }

  function mapOffsetToPos(offset: number): number {
    if (segMap.length === 0) return rangeFrom
    // Binary search for the segment containing this char offset
    let lo = 0
    let hi = segMap.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      const entry = segMap[mid]
      if (entry !== undefined && entry.charOffset <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    const entry = segMap[lo]
    if (!entry) return rangeFrom
    return entry.pmStart + (offset - entry.charOffset)
  }

  return { text: fullText, mapOffsetToPos }
}

// ── Decoration builder ─────────────────────────────────────────────────────

function buildDecorations(state: FindState, doc: PmNode): DecorationSet {
  if (!state.matches.length) return DecorationSet.empty

  const decos: Decoration[] = []
  for (let i = 0; i < state.matches.length; i++) {
    const m = state.matches[i]
    if (!m) continue
    const cls =
      i === state.activeIndex
        ? 'parchment-find-match parchment-find-match-active'
        : 'parchment-find-match'
    decos.push(Decoration.inline(m.from, m.to, { class: cls }))
  }
  return DecorationSet.create(doc, decos)
}

// ── Core find runner ───────────────────────────────────────────────────────

function runFind(
  doc: PmNode,
  query: string,
  opts: FindOptions,
  scope: 'doc' | 'selection',
  selectionFrom: number,
  selectionTo: number,
  targetActiveIndex: number,
): Pick<FindState, 'matches' | 'error' | 'decorations'> {
  if (!query) {
    return { matches: [], error: null, decorations: DecorationSet.empty }
  }

  // PM positions: for doc scope, the content occupies [0, doc.content.size]
  const rangeFrom = scope === 'selection' ? selectionFrom : 0
  const rangeTo = scope === 'selection' ? selectionTo : doc.content.size

  const { text, mapOffsetToPos } = buildTextMap(doc, rangeFrom, rangeTo)
  const result = findMatches(text, query, opts)

  if (!result.ok) {
    return { matches: [], error: result.error, decorations: DecorationSet.empty }
  }

  const pmMatches = result.matches.map((m: Match) => ({
    from: mapOffsetToPos(m.from),
    to: mapOffsetToPos(m.to),
  }))

  const activeIndex = pmMatches.length === 0 ? 0 : Math.min(targetActiveIndex, pmMatches.length - 1)

  const partial: FindState = {
    query,
    opts,
    scope,
    matches: pmMatches,
    activeIndex,
    error: null,
    decorations: DecorationSet.empty,
  }
  const decorations = buildDecorations(partial, doc)

  return { matches: pmMatches, error: null, decorations }
}

// ── Extension ──────────────────────────────────────────────────────────────

export type FindReplaceOptions = {
  /** Called when the UI should open. mode='find'|'replace'. */
  onOpen?: (mode: 'find' | 'replace') => void
}

export const FindReplaceExtension = Extension.create<FindReplaceOptions>({
  name: 'findReplace',

  addOptions(): FindReplaceOptions {
    return {}
  },

  addCommands() {
    return {
      setFindQuery:
        (query, opts) =>
        ({ tr, state, dispatch }) => {
          const { scope: _scope, ...findOpts } = opts ?? {}
          const scope = _scope ?? 'doc'
          const { selection } = state

          const { matches, error, decorations } = runFind(
            state.doc,
            query,
            findOpts,
            scope,
            selection.from,
            selection.to,
            0,
          )

          const newState: FindState = {
            query,
            opts: findOpts,
            scope,
            matches,
            activeIndex: 0,
            error,
            decorations,
          }

          if (dispatch) {
            tr.setMeta(findReplaceKey, { type: 'setState', state: newState })
            dispatch(tr)
          }
          return true
        },

      findNext:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state) ?? { ...EMPTY_STATE }
          if (!pluginState.matches.length) return false

          const nextIndex = (pluginState.activeIndex + 1) % pluginState.matches.length

          const newState: FindState = {
            ...pluginState,
            activeIndex: nextIndex,
            decorations: buildDecorations({ ...pluginState, activeIndex: nextIndex }, state.doc),
          }

          if (dispatch) {
            tr.setMeta(findReplaceKey, { type: 'setState', state: newState })
            dispatch(tr)
          }
          return true
        },

      findPrev:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state) ?? { ...EMPTY_STATE }
          if (!pluginState.matches.length) return false

          const prevIndex =
            (pluginState.activeIndex - 1 + pluginState.matches.length) % pluginState.matches.length

          const newState: FindState = {
            ...pluginState,
            activeIndex: prevIndex,
            decorations: buildDecorations({ ...pluginState, activeIndex: prevIndex }, state.doc),
          }

          if (dispatch) {
            tr.setMeta(findReplaceKey, { type: 'setState', state: newState })
            dispatch(tr)
          }
          return true
        },

      replaceCurrent:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state) ?? { ...EMPTY_STATE }
          const { matches, activeIndex } = pluginState
          const match = matches[activeIndex]
          if (!match) return false

          if (dispatch) {
            // Replace the current match text
            if (replacement === '') {
              tr.delete(match.from, match.to)
            } else {
              tr.replaceWith(match.from, match.to, state.schema.text(replacement))
            }

            // Re-run find on the new doc
            const newDoc = tr.doc
            const newSel = tr.selection
            const {
              matches: newMatches,
              error,
              decorations,
            } = runFind(
              newDoc,
              pluginState.query,
              pluginState.opts,
              pluginState.scope,
              newSel.from,
              newSel.to,
              Math.min(activeIndex, Math.max(0, matches.length - 2)),
            )

            const newFindState: FindState = {
              ...pluginState,
              matches: newMatches,
              activeIndex: Math.min(activeIndex, Math.max(0, newMatches.length - 1)),
              error,
              decorations,
            }

            tr.setMeta(findReplaceKey, { type: 'setState', state: newFindState })
            dispatch(tr)
          }
          return true
        },

      replaceAll:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state) ?? { ...EMPTY_STATE }
          const { matches } = pluginState
          if (!matches.length) return false

          if (dispatch) {
            // Apply right-to-left so earlier positions stay valid
            const sorted = [...matches].sort((a, b) => b.from - a.from)
            for (const m of sorted) {
              const mappedFrom = tr.mapping.map(m.from)
              const mappedTo = tr.mapping.map(m.to)
              if (replacement === '') {
                tr.delete(mappedFrom, mappedTo)
              } else {
                tr.replaceWith(mappedFrom, mappedTo, state.schema.text(replacement))
              }
            }

            const newFindState: FindState = {
              ...pluginState,
              matches: [],
              activeIndex: 0,
              decorations: DecorationSet.empty,
            }
            tr.setMeta(findReplaceKey, { type: 'setState', state: newFindState })
            dispatch(tr)
          }
          return true
        },

      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceKey, { type: 'setState', state: { ...EMPTY_STATE } })
            dispatch(tr)
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.options.onOpen?.('find')
        return true
      },
      'Mod-Shift-h': () => {
        this.options.onOpen?.('replace')
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findReplaceKey,

        state: {
          init(): FindState {
            return { ...EMPTY_STATE }
          },

          apply(tr, prev): FindState {
            const meta = tr.getMeta(findReplaceKey) as
              | { type: 'setState'; state: FindState }
              | undefined

            if (meta?.type === 'setState') {
              return meta.state
            }

            // Map decorations through document changes
            if (tr.docChanged) {
              const mappedDecos = prev.decorations.map(tr.mapping, tr.doc)
              const mappedMatches = prev.matches
                .map((m) => ({
                  from: tr.mapping.map(m.from),
                  to: tr.mapping.map(m.to),
                }))
                .filter((m) => m.from < m.to)

              return {
                ...prev,
                matches: mappedMatches,
                decorations: mappedDecos,
              }
            }

            return prev
          },
        },

        props: {
          decorations(state) {
            return findReplaceKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/** Read the current find state from an editor's ProseMirror state. */
export function getFindState(pmState: import('@tiptap/pm/state').EditorState): FindState {
  return findReplaceKey.getState(pmState) ?? { ...EMPTY_STATE }
}
