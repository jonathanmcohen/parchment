import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { WikiDoc, WikiSuggestionMenuRef } from '@/components/editor/WikiSuggestionMenu'
import { getSuggestionContainer } from '@/lib/editor/extensions/suggestion-container'

// Distinct plugin key — @tiptap/suggestion defaults to a single shared key, so
// without this the `[[` suggestion plugin collides with the slash-menu `/`
// suggestion plugin and ProseMirror throws "adding two plugins with the same
// key" at EditorState.create, breaking the whole editor.
const wikiSuggestionPluginKey = new PluginKey('wikiSuggestion')

// ── `[[` autocomplete extension ─────────────────────────────────────────────
//
// Mirrors slash-menu.ts: a @tiptap/suggestion plugin drives a ReactRenderer
// popup (WikiSuggestionMenu) with arrow/Enter/Esc keyboard nav. The trigger is
// the two-character string `[[` — @tiptap/suggestion's default matcher escapes
// the trigger via escapeForRegEx, so a multi-char `char` is supported: it
// matches `[[query` and strips `char.length` (2) leading chars to yield the
// query. Selecting a doc deletes the typed `[[query` range and inserts a
// wikiLink atom node carrying the chosen doc's { targetId, label }.

export const WikiSuggestionExtension = Extension.create({
  name: 'wikiSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<WikiDoc>({
        editor: this.editor,
        // v0.1.9 #9: mount into the body-level themed overlay root so dark-mode
        // tokens resolve AND z-index:9999 wins over in-page code-block/TOC
        // stacking contexts (re-synced per popup-open in onStart below).
        container: getSuggestionContainer(),
        pluginKey: wikiSuggestionPluginKey,
        char: '[[',
        startOfLine: false,
        // Allow the trigger after any prefix (start of line, space, newline, or
        // mid-word — wiki links can follow any character).
        allowedPrefixes: null,

        // Item fetching is delegated to the React component (it calls
        // /api/docs/search). The plugin only needs the popup to open, so we
        // return an empty list here and let the menu populate itself.
        items: () => [],

        // Selecting a doc: delete the `[[query` range, then insert the wikiLink.
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertWikiLink({ targetId: props.id, label: props.title })
            .run()
        },

        // render() bridges to the React WikiSuggestionMenu (same pattern as
        // slash-menu.ts).
        render: () => {
          let component: ReactRenderer<
            WikiSuggestionMenuRef,
            { query: string; command: (doc: WikiDoc) => void }
          > | null = null
          let unmountFn: (() => void) | null = null

          return {
            onStart(props) {
              // Re-sync the overlay root's theme attrs at popup-open time so a
              // runtime theme switch (light↔dark / HC / dyslexic) is reflected.
              getSuggestionContainer()
              const { WikiSuggestionMenu } = require('@/components/editor/WikiSuggestionMenu') as {
                WikiSuggestionMenu: import('react').ForwardRefExoticComponent<
                  import('@/components/editor/WikiSuggestionMenu').WikiSuggestionMenuProps &
                    import('react').RefAttributes<WikiSuggestionMenuRef>
                >
              }

              component = new ReactRenderer(WikiSuggestionMenu, {
                props: {
                  query: props.query,
                  command: (doc: WikiDoc) => props.command(doc),
                },
                editor: props.editor,
              })

              unmountFn = props.mount(component.element)
            },

            onUpdate(props) {
              component?.updateProps({
                query: props.query,
                command: (doc: WikiDoc) => props.command(doc),
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
