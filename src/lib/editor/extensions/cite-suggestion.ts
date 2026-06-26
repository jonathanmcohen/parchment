/**
 * G7b — @-triggered cite autocomplete.
 *
 * Trigger: `@`. Items = the current doc's bibliography refs filtered by query
 * against citeLabel(). Selecting inserts a citation node via insertCitation().
 *
 * DISTINCT PluginKey: citeSuggestionPluginKey uses `new PluginKey('citeSuggestion')`
 * — it MUST NOT share a key with slashMenu, wikiSuggestion, or any other
 * Suggestion plugin. (F6 lesson: shared keys crash at EditorState.create.)
 */

import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { CiteSuggestionMenuRef } from '@/components/editor/CiteSuggestionMenu'
import { citeLabel } from '@/lib/citations/format'
import type { CslEntry } from '@/lib/citations/types'
import { parseCslEntries } from '@/lib/citations/types'
import { citationResolveKey } from '@/lib/editor/extensions/citation'
import { getSuggestionContainer } from '@/lib/editor/extensions/suggestion-container'

// DISTINCT key — critical (F6 lesson).
const citeSuggestionPluginKey = new PluginKey('citeSuggestion')

export const CiteSuggestionExtension = Extension.create({
  name: 'citeSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<CslEntry>({
        editor: this.editor,
        // v0.1.9 #9: mount into the body-level themed overlay root so dark-mode
        // tokens resolve AND z-index:9999 wins over in-page code-block/TOC
        // stacking contexts (re-synced per popup-open in onStart below).
        container: getSuggestionContainer(),
        pluginKey: citeSuggestionPluginKey,
        char: '@',
        startOfLine: false,
        allowedPrefixes: null,

        items: ({ query }) => {
          // Collect refs from the resolution plugin (which already parsed the
          // bibliography node's refs). Fall back to empty if no bibliography.
          const resolution = citationResolveKey.getState(this.editor.view.state)
          if (!resolution || resolution.size === 0) return []

          // We need the raw entries to filter — read from the doc directly.
          const entries: CslEntry[] = []
          this.editor.state.doc.descendants((node) => {
            if (node.type.name === 'bibliography') {
              entries.push(...parseCslEntries(node.attrs.refs as unknown))
              return false
            }
            return true
          })

          if (entries.length === 0) return []
          if (!query) return entries.slice(0, 10)

          const q = query.toLowerCase()
          return entries
            .filter((e) => {
              const label = citeLabel(e).toLowerCase()
              return label.includes(q) || e.id.toLowerCase().includes(q)
            })
            .slice(0, 10)
        },

        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).insertCitation(props.id).run()
        },

        render: () => {
          let component: ReactRenderer<
            CiteSuggestionMenuRef,
            { items: CslEntry[]; command: (entry: CslEntry) => void }
          > | null = null
          let unmountFn: (() => void) | null = null

          return {
            onStart(props) {
              // Re-sync the overlay root's theme attrs at popup-open time so a
              // runtime theme switch (light↔dark / HC / dyslexic) is reflected.
              getSuggestionContainer()
              const { CiteSuggestionMenu } = require('@/components/editor/CiteSuggestionMenu') as {
                CiteSuggestionMenu: import('react').ForwardRefExoticComponent<
                  import('@/components/editor/CiteSuggestionMenu').CiteSuggestionMenuProps &
                    import('react').RefAttributes<CiteSuggestionMenuRef>
                >
              }

              component = new ReactRenderer(CiteSuggestionMenu, {
                props: {
                  items: props.items,
                  command: (entry: CslEntry) => props.command(entry),
                },
                editor: props.editor,
              })

              unmountFn = props.mount(component.element)
            },

            onUpdate(props) {
              component?.updateProps({
                items: props.items,
                command: (entry: CslEntry) => props.command(entry),
              })
            },

            onExit() {
              unmountFn?.()
              unmountFn = null
              component?.destroy()
              component = null
            },

            onKeyDown({ event }) {
              if (event.key === 'Escape') return false
              return component?.ref?.onKeyDown(event) ?? false
            },
          }
        },
      }),
    ]
  },
})
