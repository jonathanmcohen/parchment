import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { SlashMenuRef } from '@/components/editor/SlashMenu'
import { filterSlashItems, type SlashItem } from '@/lib/editor/slash-items'

// ── Extension options ──────────────────────────────────────────────────────

export type SlashMenuOptions = {
  /**
   * Called when the Image item is selected — opens the image dialog.
   * If not provided, the image item is a no-op.
   */
  onOpenImage?: () => void
}

// ── Item → editor action map ───────────────────────────────────────────────

type ActionContext = {
  editor: import('@tiptap/core').Editor
  range: import('@tiptap/core').Range
  onOpenImage: (() => void) | undefined
}

function runAction(item: SlashItem, ctx: ActionContext): void {
  const { editor, range, onOpenImage } = ctx

  // Delete the slash + query text first
  editor.chain().focus().deleteRange(range).run()

  switch (item.id) {
    case 'paragraph':
      editor.chain().focus().setParagraph().run()
      break

    case 'heading1':
      editor.chain().focus().toggleHeading({ level: 1 }).run()
      break

    case 'heading2':
      editor.chain().focus().toggleHeading({ level: 2 }).run()
      break

    case 'heading3':
      editor.chain().focus().toggleHeading({ level: 3 }).run()
      break

    case 'horizontalRule':
      editor.chain().focus().setHorizontalRule().run()
      break

    case 'blockquote':
      editor.chain().focus().toggleBlockquote().run()
      break

    case 'codeBlock':
      editor.chain().focus().toggleCodeBlock().run()
      break

    case 'bulletList':
      editor.chain().focus().toggleBulletList().run()
      break

    case 'orderedList':
      editor.chain().focus().toggleOrderedList().run()
      break

    case 'taskList':
      editor.chain().focus().toggleTaskList().run()
      break

    case 'image':
      // Delegate to the image dialog via callback
      onOpenImage?.()
      break

    case 'table':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break

    case 'toc':
      editor.chain().focus().insertToc().run()
      break

    case 'footnote':
      editor.chain().focus().insertFootnote().run()
      break

    case 'pageBreak':
      editor.chain().focus().insertPageBreak().run()
      break

    case 'sectionBreak':
      editor.chain().focus().insertSectionBreak().run()
      break
  }
}

// ── Extension ──────────────────────────────────────────────────────────────

export const SlashMenuExtension = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions(): SlashMenuOptions {
    return {}
  },

  addProseMirrorPlugins() {
    // Capture `this` fields for use inside the closure
    const extensionOptions = this.options

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        // Allow slash after space (not just at start of line)
        allowedPrefixes: [' ', '\n', null] as unknown as string[],

        // Filter items by query
        items: ({ query }) => filterSlashItems(query),

        // When an item is selected: delete the range and run the action
        command: ({ editor, range, props }) => {
          runAction(props as SlashItem, {
            editor,
            range,
            onOpenImage: extensionOptions.onOpenImage,
          })
        },

        // render() bridges to the React SlashMenu component
        render: () => {
          let component: ReactRenderer<
            SlashMenuRef,
            { query: string; command: (item: SlashItem) => void }
          > | null = null
          let unmountFn: (() => void) | null = null

          return {
            onStart(props) {
              // Dynamically import the component to avoid SSR issues (it's 'use client')
              // We use the synchronous import path — the component is client-only anyway.
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { SlashMenu } = require('@/components/editor/SlashMenu') as {
                SlashMenu: import('react').ForwardRefExoticComponent<
                  import('@/components/editor/SlashMenu').SlashMenuProps &
                    import('react').RefAttributes<SlashMenuRef>
                >
              }

              component = new ReactRenderer(SlashMenu, {
                props: {
                  query: props.query,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              })

              unmountFn = props.mount(component.element)
            },

            onUpdate(props) {
              component?.updateProps({
                query: props.query,
                command: (item: SlashItem) => props.command(item),
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
                // Let the suggestion plugin close the menu
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
