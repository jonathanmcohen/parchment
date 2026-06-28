import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type Spacer, topLevelBlockOffsets } from '@/lib/editor/pagination'

export interface PaginationState {
  spacers: Spacer[]
}

export const paginationKey = new PluginKey<PaginationState>('paginationLive')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paginationLive: {
      /** Replace the live-pagination spacer list (meta-only; no doc change). */
      setPaginationSpacers: (spacers: Spacer[]) => ReturnType
    }
  }
}

/** The DOM for one spacer: an inert block that simply occupies vertical space. */
function makeSpacerDOM(height: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'parchment-page-spacer'
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('data-pagination-spacer', '')
  el.contentEditable = 'false'
  el.style.height = `${height}px`
  el.style.width = '100%'
  el.style.pointerEvents = 'none'
  el.style.userSelect = 'none'
  return el
}

/**
 * Thin live-pagination plugin: holds a spacer list (pushed from React) and
 * renders each as a non-document widget decoration before its target block. It
 * does NO measurement and owns NO timers. Updates arrive via a meta-only
 * transaction, so they create no Yjs update and no history entry.
 */
export const PaginationLive = Extension.create({
  name: 'paginationLive',

  addCommands() {
    return {
      setPaginationSpacers:
        (spacers: Spacer[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(paginationKey, { spacers })
            tr.setMeta('addToHistory', false)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ spacers: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as PaginationState | undefined
            return meta ?? value
          },
        },
        props: {
          decorations(state) {
            const pstate = paginationKey.getState(state)
            const spacers = pstate?.spacers ?? []
            if (spacers.length === 0) return DecorationSet.empty
            const offsets = topLevelBlockOffsets(state.doc)
            const decos: Decoration[] = []
            for (const s of spacers) {
              const pos = offsets[s.beforeBlockIndex]
              if (pos == null) continue
              decos.push(
                Decoration.widget(pos, () => makeSpacerDOM(s.height), {
                  side: -1,
                  key: `pg-spacer-${s.beforeBlockIndex}-${s.height}`,
                }),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
