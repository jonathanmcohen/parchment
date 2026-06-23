import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Match } from '@/lib/integrations/dictionary'

// K7: grammar-check decorations. LanguageTool returns character offsets into the
// document's plain text; this extension maps those offsets to ProseMirror
// positions and renders each flagged span as an underlined inline decoration the
// GrammarPopover can anchor to.
//
// F6 lesson: a DISTINCT PluginKey ('grammarCheck') — it NEVER shares a key with
// slashMenu, wikiSuggestion, citeSuggestion, cairnSuggestion, or findReplace.
//
// The match list is owned by React (Editor state) and pushed in via the
// setGrammarMatches command; the plugin only maps offsets → positions and builds
// decorations. Decorations are remapped through doc changes so they survive
// typing until the next check replaces them.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grammarCheck: {
      /** Replace the active grammar matches and rebuild decorations. */
      setGrammarMatches: (matches: Match[]) => ReturnType
      /** Clear all grammar decorations. */
      clearGrammarMatches: () => ReturnType
    }
  }
}

/** A grammar match resolved to absolute ProseMirror positions. */
export interface PositionedMatch {
  from: number
  to: number
  match: Match
}

interface GrammarState {
  matches: PositionedMatch[]
  decorations: DecorationSet
}

const EMPTY: GrammarState = { matches: [], decorations: DecorationSet.empty }

export const grammarCheckKey = new PluginKey<GrammarState>('grammarCheck')

const SET_META = 'grammar:set'
const CLEAR_META = 'grammar:clear'

/**
 * Walk the doc and build a flat plain-text string plus an offset→PM-position
 * mapper. This MUST match how the editor's text is serialized for the grammar
 * request (we send `editor.state.doc.textBetween(0, size, '\n', '\n')`), so the
 * block separator here is a single '\n' per node boundary — identical to the
 * textBetween leaf/block separators used on the request side.
 */
function buildTextMap(doc: PmNode): {
  text: string
  mapOffsetToPos: (offset: number) => number
} {
  const segments: Array<{ charOffset: number; pmStart: number }> = []
  let fullText = ''
  let charOffset = 0

  doc.descendants((node, pos) => {
    if (node.isText) {
      const t = node.text ?? ''
      if (t) {
        segments.push({ charOffset, pmStart: pos })
        fullText += t
        charOffset += t.length
      }
      return false
    }
    // Block boundary separator — textBetween inserts the blockSeparator between
    // block leaves. We mirror that with a single '\n' that maps to the node pos.
    if (node.isBlock && fullText.length > 0 && !fullText.endsWith('\n')) {
      segments.push({ charOffset, pmStart: pos })
      fullText += '\n'
      charOffset += 1
    }
    return true
  })

  function mapOffsetToPos(offset: number): number {
    if (segments.length === 0) return 1
    let lo = 0
    let hi = segments.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      const entry = segments[mid]
      if (entry !== undefined && entry.charOffset <= offset) lo = mid
      else hi = mid - 1
    }
    const entry = segments[lo]
    if (!entry) return 1
    return entry.pmStart + (offset - entry.charOffset)
  }

  return { text: fullText, mapOffsetToPos }
}

function positionMatches(doc: PmNode, matches: Match[]): PositionedMatch[] {
  const { text, mapOffsetToPos } = buildTextMap(doc)
  const out: PositionedMatch[] = []
  for (const m of matches) {
    if (m.offset < 0 || m.length <= 0 || m.offset + m.length > text.length) continue
    const from = mapOffsetToPos(m.offset)
    const to = mapOffsetToPos(m.offset + m.length)
    if (to <= from) continue
    out.push({ from, to, match: m })
  }
  return out
}

function buildDecorations(doc: PmNode, matches: PositionedMatch[]): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  const decos = matches.map((pm) =>
    Decoration.inline(pm.from, pm.to, {
      class: 'parchment-grammar-match',
    }),
  )
  return DecorationSet.create(doc, decos)
}

export const GrammarCheckExtension = Extension.create({
  name: 'grammarCheck',

  addCommands() {
    return {
      setGrammarMatches:
        (matches: Match[]) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(grammarCheckKey, { type: SET_META, matches }))
          }
          return true
        },
      clearGrammarMatches:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(grammarCheckKey, { type: CLEAR_META }))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<GrammarState>({
        key: grammarCheckKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(grammarCheckKey) as
              | { type: string; matches?: Match[] }
              | undefined

            if (meta?.type === CLEAR_META) return EMPTY

            if (meta?.type === SET_META) {
              const positioned = positionMatches(tr.doc, meta.matches ?? [])
              return {
                matches: positioned,
                decorations: buildDecorations(tr.doc, positioned),
              }
            }

            if (!tr.docChanged) return prev

            // Remap existing decorations + match positions through the change so
            // they track edits until the next check replaces them.
            const decorations = prev.decorations.map(tr.mapping, tr.doc)
            const matches = prev.matches
              .map((pm) => ({
                from: tr.mapping.map(pm.from),
                to: tr.mapping.map(pm.to),
                match: pm.match,
              }))
              .filter((pm) => pm.to > pm.from)
            return { matches, decorations }
          },
        },
        props: {
          decorations(state) {
            return grammarCheckKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/** Read the current positioned matches from editor state (for the panel). */
export function getGrammarMatches(state: EditorState): PositionedMatch[] {
  return grammarCheckKey.getState(state)?.matches ?? []
}
