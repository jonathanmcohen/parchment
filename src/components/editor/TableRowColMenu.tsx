'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useRef } from 'react'
import { tableMenuAction } from '@/lib/editor/table-controls'

// v0.2.10 table UX pass — the themed row/column context menu opened by a grip
// click (or the ⋮ affordance). Reuses the shared `.px-menu` shell + `.px-menu-item`
// rows so it matches every other dropdown, and is portalled (by the caller) to
// `#parchment-overlay-root` so it escapes the editor's overflow and paints above
// NodeViews (the v0.1.9 #1/#9 lesson).
//
// Every row is a single `tableMenuAction` call → one transaction → collab-safe.
// The overlay pre-selects the target row/column (grip click) so the underlying
// Tiptap table commands (`selectedRect`) operate on exactly the picked line.

type Props = {
  editor: Editor
  kind: 'row' | 'col'
  /** The grip's viewport rect — the menu is anchored just outside it. */
  anchor: DOMRect
  onClose: () => void
}

type Item =
  | { kind: 'action'; label: string; icon: string; action: Parameters<typeof tableMenuAction>[1] }
  | { kind: 'separator' }

function rowItems(): Item[] {
  return [
    { kind: 'action', label: 'Insert row above', icon: 'add_row_above', action: 'insertRowAbove' },
    { kind: 'action', label: 'Insert row below', icon: 'add_row_below', action: 'insertRowBelow' },
    { kind: 'separator' },
    { kind: 'action', label: 'Toggle header row', icon: 'toggle_on', action: 'toggleHeaderRow' },
    { kind: 'separator' },
    { kind: 'action', label: 'Delete row', icon: 'delete', action: 'deleteRow' },
    { kind: 'action', label: 'Delete table', icon: 'grid_off', action: 'deleteTable' },
  ]
}

function colItems(): Item[] {
  return [
    {
      kind: 'action',
      label: 'Insert column left',
      icon: 'add_column_left',
      action: 'insertColumnLeft',
    },
    {
      kind: 'action',
      label: 'Insert column right',
      icon: 'add_column_right',
      action: 'insertColumnRight',
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Toggle header column',
      icon: 'toggle_on',
      action: 'toggleHeaderColumn',
    },
    { kind: 'separator' },
    { kind: 'action', label: 'Delete column', icon: 'delete', action: 'deleteColumn' },
    { kind: 'action', label: 'Delete table', icon: 'grid_off', action: 'deleteTable' },
  ]
}

export function TableRowColMenu({ editor, kind, anchor, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const items = kind === 'row' ? rowItems() : colItems()

  // Outside-click + Esc dismiss (mirrors useMenuDismiss; kept inline so the menu
  // has no dependency on a wrapping trigger element — it is portalled).
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        editor.chain().focus().run()
      }
    }
    // Defer so the opening click doesn't immediately dismiss.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [editor, onClose])

  // Anchor the menu just below/right of the grip. `position:fixed` (viewport
  // coords) since the portal root is a static body child.
  const style: React.CSSProperties =
    kind === 'row'
      ? { position: 'fixed', top: anchor.top, left: anchor.right + 4 }
      : { position: 'fixed', top: anchor.bottom + 4, left: anchor.left }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={kind === 'row' ? 'Row options' : 'Column options'}
      className="px-menu parchment-menu-dropdown-fixed parchment-table-menu"
      style={style}
    >
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          // biome-ignore lint/suspicious/noArrayIndexKey: static config, order-stable
          return <hr key={`sep-${i}`} className="px-menu-separator" />
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="px-menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              tableMenuAction(editor, item.action)
              onClose()
            }}
          >
            <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
              {item.icon}
            </span>
            <span className="px-menu-item-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
