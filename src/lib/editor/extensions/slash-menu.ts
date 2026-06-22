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
  /**
   * G4: called after a math node is inserted with empty LaTeX, with the doc
   * position of the new node, so the editor can open the LaTeX popover. If not
   * provided, the math node is inserted empty (still editable on click).
   */
  onEditMath?: (pos: number) => void
  /**
   * G8b: called when the "Cross-reference" slash item is selected — opens the
   * CrossRefPicker so the user can pick a target. If not provided, the item is
   * a no-op.
   */
  onOpenCrossRefPicker?: () => void
}

// ── Item → editor action map ───────────────────────────────────────────────

type ActionContext = {
  editor: import('@tiptap/core').Editor
  range: import('@tiptap/core').Range
  onOpenImage: (() => void) | undefined
  onEditMath: ((pos: number) => void) | undefined
  onOpenCrossRefPicker: (() => void) | undefined
}

/**
 * G4: count display equations (mathBlock) in the doc — used to default the
 * "Equation reference" ordinal to the last equation and to clamp the prompt.
 */
function countMathBlocks(editor: import('@tiptap/core').Editor): number {
  let n = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mathBlock') n += 1
    return true
  })
  return n
}

function runAction(item: SlashItem, ctx: ActionContext): void {
  const { editor, range, onOpenImage, onEditMath, onOpenCrossRefPicker } = ctx

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

    // G5: drawing — insert the empty node, then open the Excalidraw modal at the
    // new node's position. The dispatch must happen AFTER .run() so editor.state
    // reflects the inserted node (inside the chain, view.state is pre-insertion).
    case 'drawing': {
      editor.chain().focus().insertDrawing().run()
      const { state } = editor
      const selFrom = state.selection.from
      let drawingPos: number | null = null
      // After inserting the block atom the selection node-selects it, so the
      // drawing sits exactly at selFrom. Fall back to a small window scan in case
      // the cursor landed beside the node rather than on it.
      const selected = state.doc.nodeAt(selFrom)
      if (selected?.type.name === 'drawing') {
        drawingPos = selFrom
      } else {
        const lo = Math.max(0, selFrom - 2)
        const hi = Math.min(state.doc.content.size, selFrom + 2)
        state.doc.nodesBetween(lo, hi, (node, pos) => {
          if (node.type.name === 'drawing') drawingPos = pos
        })
      }
      if (drawingPos !== null) {
        editor.view.dom.dispatchEvent(
          new CustomEvent('parchment:edit-drawing', {
            bubbles: true,
            detail: { pos: drawingPos, scene: null },
          }),
        )
      }
      break
    }

    // G6a: mermaid — insert the empty node, then open the mermaid popover at
    // the new node's position. The dispatch must happen AFTER .run() so
    // editor.state reflects the inserted node (inside the chain, view.state is
    // pre-insertion). Mirrors the corrected 'drawing' case exactly.
    case 'mermaid': {
      editor.chain().focus().insertMermaid().run()
      const { state } = editor
      const selFrom = state.selection.from
      let mermaidPos: number | null = null
      // After inserting the block atom the selection node-selects it, so the
      // mermaid node sits exactly at selFrom. Fall back to a small window scan
      // in case the cursor landed beside the node rather than on it.
      const selectedNode = state.doc.nodeAt(selFrom)
      if (selectedNode?.type.name === 'mermaid') {
        mermaidPos = selFrom
      } else {
        const lo = Math.max(0, selFrom - 2)
        const hi = Math.min(state.doc.content.size, selFrom + 2)
        state.doc.nodesBetween(lo, hi, (node, nodePos) => {
          if (node.type.name === 'mermaid') mermaidPos = nodePos
        })
      }
      if (mermaidPos !== null) {
        editor.view.dom.dispatchEvent(
          new CustomEvent('parchment:edit-mermaid', {
            bubbles: true,
            detail: { pos: mermaidPos, source: '' },
          }),
        )
      }
      break
    }

    // G6b: plantuml — insert the empty node, then open the plantuml popover at
    // the new node's position. The dispatch must happen AFTER .run() so
    // editor.state reflects the inserted node (inside the chain, view.state is
    // pre-insertion). Mirrors the mermaid case exactly.
    case 'plantuml': {
      editor.chain().focus().insertPlantuml().run()
      const { state } = editor
      const selFrom = state.selection.from
      let plantumlPos: number | null = null
      // After inserting the block atom the selection node-selects it, so the
      // plantuml node sits exactly at selFrom. Fall back to a small window scan
      // in case the cursor landed beside the node rather than on it.
      const selectedPlantumlNode = state.doc.nodeAt(selFrom)
      if (selectedPlantumlNode?.type.name === 'plantuml') {
        plantumlPos = selFrom
      } else {
        const lo = Math.max(0, selFrom - 2)
        const hi = Math.min(state.doc.content.size, selFrom + 2)
        state.doc.nodesBetween(lo, hi, (node, nodePos) => {
          if (node.type.name === 'plantuml') plantumlPos = nodePos
        })
      }
      if (plantumlPos !== null) {
        editor.view.dom.dispatchEvent(
          new CustomEvent('parchment:edit-plantuml', {
            bubbles: true,
            detail: { pos: plantumlPos, source: '' },
          }),
        )
      }
      break
    }

    // G6c: drawio — insert the empty node, then open the drawio modal at the
    // new node's position. The dispatch must happen AFTER .run() so
    // editor.state reflects the inserted node (inside the chain, view.state is
    // pre-insertion). Mirrors the mermaid/plantuml case exactly.
    case 'drawio': {
      editor.chain().focus().insertDrawio().run()
      const { state } = editor
      const selFrom = state.selection.from
      let drawioPos: number | null = null
      // After inserting the block atom the selection node-selects it, so the
      // drawio node sits exactly at selFrom. Fall back to a small window scan
      // in case the cursor landed beside the node rather than on it.
      const selectedDrawioNode = state.doc.nodeAt(selFrom)
      if (selectedDrawioNode?.type.name === 'drawio') {
        drawioPos = selFrom
      } else {
        const lo = Math.max(0, selFrom - 2)
        const hi = Math.min(state.doc.content.size, selFrom + 2)
        state.doc.nodesBetween(lo, hi, (node, nodePos) => {
          if (node.type.name === 'drawio') drawioPos = nodePos
        })
      }
      if (drawioPos !== null) {
        editor.view.dom.dispatchEvent(
          new CustomEvent('parchment:edit-drawio', {
            bubbles: true,
            detail: { pos: drawioPos, xml: '' },
          }),
        )
      }
      break
    }

    // G4: equations. Insert with empty LaTeX, then open the editor popover at
    // the new node's position so the user types the formula immediately.
    // Read editor.state AFTER .run() so the position reflects the post-insertion
    // state — the same pattern used by the G6 mermaid/plantuml/drawio cases.
    case 'mathBlock': {
      editor.chain().focus().insertMathBlock('').run()
      const { state: mathBlockState } = editor
      const mathBlockSelFrom = mathBlockState.selection.from
      let mathBlockPos: number | null = null
      const mathBlockNode = mathBlockState.doc.nodeAt(mathBlockSelFrom)
      if (mathBlockNode?.type.name === 'mathBlock') {
        mathBlockPos = mathBlockSelFrom
      } else {
        const lo = Math.max(0, mathBlockSelFrom - 2)
        const hi = Math.min(mathBlockState.doc.content.size, mathBlockSelFrom + 2)
        mathBlockState.doc.nodesBetween(lo, hi, (node, nodePos) => {
          if (node.type.name === 'mathBlock') mathBlockPos = nodePos
        })
      }
      if (mathBlockPos !== null) onEditMath?.(mathBlockPos)
      break
    }

    case 'mathInline': {
      editor.chain().focus().insertMathInline('').run()
      const { state: mathInlineState } = editor
      const mathInlineSelFrom = mathInlineState.selection.from
      let mathInlinePos: number | null = null
      const mathInlineNode = mathInlineState.doc.nodeAt(mathInlineSelFrom)
      if (mathInlineNode?.type.name === 'mathInline') {
        mathInlinePos = mathInlineSelFrom
      } else {
        const lo = Math.max(0, mathInlineSelFrom - 2)
        const hi = Math.min(mathInlineState.doc.content.size, mathInlineSelFrom + 2)
        mathInlineState.doc.nodesBetween(lo, hi, (node, nodePos) => {
          if (node.type.name === 'mathInline') mathInlinePos = nodePos
        })
      }
      if (mathInlinePos !== null) onEditMath?.(mathInlinePos)
      break
    }

    // G7b: bibliography — insert the bibliography block. The block is edited
    // inline via its NodeView (no auto-open needed — mirrors the footnote case).
    // The corrected after-.run() pattern is used for consistency; bibliography
    // edits inline so no secondary dispatch is needed.
    case 'bibliography': {
      editor.chain().focus().insertBibliography().run()
      break
    }

    case 'equationRef': {
      // v0.1 by-index picker: prompt for the equation ordinal, defaulting to the
      // last equation in the doc. The ref re-resolves through the numbering, so
      // an out-of-range index simply renders as unresolved until an equation
      // fills that slot.
      const count = countMathBlocks(editor)
      const def = count > 0 ? String(count) : '1'
      const raw =
        typeof window !== 'undefined' ? window.prompt('Reference equation number:', def) : def
      if (raw === null) break
      const idx = Number.parseInt(raw, 10)
      if (Number.isFinite(idx) && idx >= 1) {
        editor.chain().focus().insertEquationRef(idx).run()
      }
      break
    }

    // G8b: cross-reference — open the CrossRefPicker so the user picks a target.
    // The picker calls insertCrossRef on selection. The slash range is already
    // deleted above (before the switch), so the picker inserts at the current
    // cursor position (which is where the range was).
    case 'crossRef': {
      onOpenCrossRefPicker?.()
      break
    }

    // G16: speaker note — insert an empty speakerNote block. No popup needed;
    // the block is inline-editable via contenteditable. Plain insert pattern.
    case 'speakerNote': {
      editor.chain().focus().insertSpeakerNote().run()
      break
    }
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
            onEditMath: extensionOptions.onEditMath,
            onOpenCrossRefPicker: extensionOptions.onOpenCrossRefPicker,
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
