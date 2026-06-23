import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { CairnPage, CairnSuggestionMenuRef } from '@/components/editor/CairnSuggestionMenu'

// DISTINCT plugin key — @tiptap/suggestion defaults to a single shared key, so
// without a unique key here the `[[cairn://` suggestion plugin would collide
// with the slash-menu `/`, the `[[` wikiSuggestion, and the `@` citeSuggestion
// plugins and ProseMirror would throw "adding two plugins with the same key" at
// EditorState.create — crashing the whole editor (the F6 lesson). This key is
// 'cairnSuggestion', shared with none of them.
const cairnSuggestionPluginKey = new PluginKey('cairnSuggestion')

// ── `[[cairn://` autocomplete extension ──────────────────────────────────────
//
// Mirrors wiki-suggestion.ts but triggers on the multi-char string `[[cairn://`
// (so a plain `[[` still opens the wiki menu — the longer Cairn trigger only
// fires once the user types the `cairn://` prefix). Selecting a page deletes the
// typed `[[cairn://query` range and inserts a cairnLink atom node carrying the
// chosen { pageId, label }. When Cairn is not configured the popup shows no
// suggestions but still allows manual pageId entry (see CairnSuggestionMenu) —
// and the search endpoint makes NO external call (off-by-default).

export const CairnSuggestionExtension = Extension.create({
  name: 'cairnSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<CairnPage>({
        editor: this.editor,
        pluginKey: cairnSuggestionPluginKey,
        char: '[[cairn://',
        startOfLine: false,
        // Allow the trigger after any prefix (cairn links can follow any char).
        allowedPrefixes: null,

        // Item fetching is delegated to the React component (it calls
        // /api/cairn/search, which returns [] when Cairn is disabled — no
        // external call). The plugin only needs the popup to open.
        items: () => [],

        // Selecting a page: delete the `[[cairn://query` range, insert cairnLink.
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertCairnLink({ pageId: props.id, label: props.title })
            .run()
        },

        // render() bridges to the React CairnSuggestionMenu (same pattern as
        // wiki-suggestion.ts — the component is require()'d lazily so no client
        // code loads on the server schema path).
        render: () => {
          let component: ReactRenderer<
            CairnSuggestionMenuRef,
            { query: string; command: (page: CairnPage) => void }
          > | null = null
          let unmountFn: (() => void) | null = null

          return {
            onStart(props) {
              const { CairnSuggestionMenu } =
                require('@/components/editor/CairnSuggestionMenu') as {
                  CairnSuggestionMenu: import('react').ForwardRefExoticComponent<
                    import('@/components/editor/CairnSuggestionMenu').CairnSuggestionMenuProps &
                      import('react').RefAttributes<CairnSuggestionMenuRef>
                  >
                }

              component = new ReactRenderer(CairnSuggestionMenu, {
                props: {
                  query: props.query,
                  command: (page: CairnPage) => props.command(page),
                },
                editor: props.editor,
              })

              unmountFn = props.mount(component.element)
            },

            onUpdate(props) {
              component?.updateProps({
                query: props.query,
                command: (page: CairnPage) => props.command(page),
              })
            },

            onExit() {
              unmountFn?.()
              unmountFn = null
              component?.destroy()
              component = null
            },

            onKeyDown({ event }) {
              if (event.key === 'Escape') {
                // Let the suggestion plugin close the menu.
                return false
              }
              return component?.ref?.onKeyDown(event) ?? false
            },
          }
        },
      }),
    ]
  },
})
