'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TableRowColMenu } from '@/components/editor/TableRowColMenu'
import { getThemedPortalRoot } from '@/components/ui/themed-portal'
import {
  getTableGeometry,
  selectTableColumn,
  selectTableRow,
  type TableGeometry,
} from '@/lib/editor/table-controls'

// v0.2.10 table UX pass — hover affordances over the ACTIVE table:
//   • per-row grips on the LEFT edge  → click selects the row + opens its menu.
//   • per-col grips on the TOP edge    → click selects the column + opens its menu.
//   • a "+" strip on the RIGHT edge    → add column after the last.
//   • a "+" strip on the BOTTOM edge   → add row after the last.
//
// Positioning mirrors ReadingPresence: an absolutely-positioned layer inside the
// editor's `position:relative` canvas gutter, with per-cell rects derived from
// `view.coordsAtPos` relative to the container. Recomputed on every transaction
// and on scroll/resize so the chrome tracks edits, resizes and reflow.
//
// Read-only safety (item #6): the whole overlay renders `null` when the editor
// is not editable, so Reading mode and the share renderer (render-pm.tsx, which
// never mounts this) stay affordance-free.

type Props = {
  editor: Editor
  /**
   * The `position:relative` container the affordances are positioned within.
   * Optional so the overlay is unit-testable standalone; in production the
   * editor passes the canvas gutter ref.
   */
  containerRef?: React.RefObject<HTMLElement | null>
}

/** A DOM rect for one grip/strip, in container-relative px. */
type Box = { top: number; left: number; width: number; height: number }

/** Which grip is open, if any. */
type OpenMenu =
  | { kind: 'row'; index: number; anchor: DOMRect }
  | { kind: 'col'; index: number; anchor: DOMRect }
  | null

export function TableControlsOverlay({ editor, containerRef }: Props) {
  // Bump on transaction / scroll / resize to recompute geometry + rects.
  const [, setTick] = useState(0)
  const [open, setOpen] = useState<OpenMenu>(null)
  // Doc position of the table currently under the pointer (null when the pointer
  // is not over a table). Drives the HOVER reveal: affordances appear when a
  // table is hovered even if the cursor/selection is elsewhere.
  const hoverPosRef = useRef<number | null>(null)
  const [hoverTablePos, setHoverTablePos] = useState<number | null>(null)

  const bump = useCallback(() => setTick((t) => (t + 1) % 1_000_000), [])

  // Recompute on editor transactions + viewport changes.
  useEffect(() => {
    const onTransaction = () => bump()
    const onScroll = () => bump()
    const onResize = () => bump()
    editor.on('transaction', onTransaction)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      editor.off('transaction', onTransaction)
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', onResize)
    }
  }, [editor, bump])

  // Track the table under the pointer. The hovered <table> DOM is resolved to
  // its DOC position via posAtCoords + an ancestor walk (same walk as
  // findSelectedTable), so grips/strips can target the hovered table even when
  // the selection is outside it (the Docs-like hover reveal).
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    const setHover = (pos: number | null) => {
      if (pos !== hoverPosRef.current) {
        hoverPosRef.current = pos
        setHoverTablePos(pos)
      }
    }
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest?.('table')) {
        setHover(null)
        return
      }
      try {
        const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (!coords) return
        const $pos = editor.state.doc.resolve(coords.pos)
        let tablePos: number | null = null
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'table') {
            tablePos = $pos.before(d)
            break
          }
        }
        setHover(tablePos)
      } catch {
        // posAtCoords unavailable (jsdom) or transiently invalid — keep state.
      }
    }
    const onLeave = () => setHover(null)
    dom.addEventListener('mousemove', onMove)
    dom.addEventListener('mouseleave', onLeave)
    return () => {
      dom.removeEventListener('mousemove', onMove)
      dom.removeEventListener('mouseleave', onLeave)
    }
  }, [editor])

  // Close the menu whenever the editor's document changes structurally (an action
  // fired) so a stale index can't apply to a shifted table.
  const closeMenu = useCallback(() => setOpen(null), [])

  if (!editor.isEditable) return null

  // Hovered table takes precedence (matches Docs: affordances follow the pointer);
  // otherwise the table around the cursor. getTableGeometry re-validates the
  // hover position against the live doc, so a stale pos degrades to null safely.
  const hoverGeo = hoverTablePos !== null ? getTableGeometry(editor, hoverTablePos) : null
  const geo = hoverGeo ?? getTableGeometry(editor)
  if (!geo) return null

  // The table's DOM element (nearest <table> to the table node position).
  const container = containerRef?.current ?? null
  const containerRect = container?.getBoundingClientRect() ?? null

  const tableBox = tableRect(editor, geo, containerRect)

  // Row grips (left edge) + column grips (top edge).
  const rowBoxes = geo.rowAnchors.map((pos) => cellBox(editor, pos, containerRect))
  const colBoxes = geo.colAnchors.map((pos) => cellBox(editor, pos, containerRect))

  return (
    <div
      className="parchment-table-overlay"
      data-active="true"
      // The layer itself must not eat pointer events over the document; each
      // affordance re-enables pointer-events on itself.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      {/* ── Row grips (left edge) ─────────────────────────────────────── */}
      {rowBoxes.map((box, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are order-stable per render
          key={`rowgrip-${i}`}
          type="button"
          aria-label={`Row ${i + 1} options`}
          aria-haspopup="menu"
          className="parchment-table-grip parchment-table-grip--row"
          style={gripRowStyle(box, tableBox)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            selectTableRow(editor, i, geo.tablePos)
            setOpen({ kind: 'row', index: i, anchor: e.currentTarget.getBoundingClientRect() })
          }}
        />
      ))}

      {/* ── Column grips (top edge) ───────────────────────────────────── */}
      {colBoxes.map((box, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: cols are order-stable per render
          key={`colgrip-${i}`}
          type="button"
          aria-label={`Column ${i + 1} options`}
          aria-haspopup="menu"
          className="parchment-table-grip parchment-table-grip--col"
          style={gripColStyle(box, tableBox)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            selectTableColumn(editor, i, geo.tablePos)
            setOpen({ kind: 'col', index: i, anchor: e.currentTarget.getBoundingClientRect() })
          }}
        />
      ))}

      {/* ── Add-column strip (right edge) ─────────────────────────────── */}
      <button
        type="button"
        aria-label="Add column"
        title="Add column"
        className="parchment-table-addstrip parchment-table-addstrip--col"
        style={addColStripStyle(tableBox)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          // Anchor to the last column so the new column lands on the right.
          selectTableColumn(editor, geo.cols - 1, geo.tablePos)
          editor.chain().focus().addColumnAfter().run()
        }}
      >
        <span aria-hidden className="material-symbols-rounded parchment-table-addstrip-icon">
          add
        </span>
      </button>

      {/* ── Add-row strip (bottom edge) ───────────────────────────────── */}
      <button
        type="button"
        aria-label="Add row"
        title="Add row"
        className="parchment-table-addstrip parchment-table-addstrip--row"
        style={addRowStripStyle(tableBox)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          selectTableRow(editor, geo.rows - 1, geo.tablePos)
          editor.chain().focus().addRowAfter().run()
        }}
      >
        <span aria-hidden className="material-symbols-rounded parchment-table-addstrip-icon">
          add
        </span>
      </button>

      {open ? <PortalMenu editor={editor} open={open} onClose={closeMenu} /> : null}
    </div>
  )
}

/** The themed row/column menu, portalled to the body-level overlay root. */
function PortalMenu({
  editor,
  open,
  onClose,
}: {
  editor: Editor
  open: NonNullable<OpenMenu>
  onClose: () => void
}) {
  const portalRoot = getThemedPortalRoot()
  if (!portalRoot) {
    // SSR / no-DOM guard — render inline so tests without a portal root still
    // find the menu (they query the overlay root OR document.body).
    return (
      <TableRowColMenu editor={editor} kind={open.kind} anchor={open.anchor} onClose={onClose} />
    )
  }
  return createPortal(
    <TableRowColMenu editor={editor} kind={open.kind} anchor={open.anchor} onClose={onClose} />,
    portalRoot,
  )
}

// ── geometry helpers ─────────────────────────────────────────────────────
// jsdom returns zero rects; these degrade to {0,0,0,0} so the affordances still
// render (their PRESENCE is what the unit tests assert; real pixel placement is
// exercised by the live browser pass).

function safeRect(el: Element | null): DOMRect | null {
  if (!el) return null
  try {
    return el.getBoundingClientRect()
  } catch {
    return null
  }
}

/** The active table's <table> DOM element. */
function tableEl(editor: Editor, geo: TableGeometry): HTMLElement | null {
  try {
    const dom = editor.view.nodeDOM(geo.tablePos)
    if (dom instanceof HTMLElement) {
      return dom.tagName === 'TABLE' ? dom : (dom.querySelector('table') ?? dom)
    }
  } catch {
    // stale position during a remote edit
  }
  return null
}

function tableRect(editor: Editor, geo: TableGeometry, containerRect: DOMRect | null): Box {
  const el = tableEl(editor, geo)
  const r = safeRect(el)
  if (!r || !containerRect) return { top: 0, left: 0, width: 0, height: 0 }
  return {
    top: r.top - containerRect.top,
    left: r.left - containerRect.left,
    width: r.width,
    height: r.height,
  }
}

/** Container-relative box for the cell at the given absolute position. */
function cellBox(editor: Editor, pos: number, containerRect: DOMRect | null): Box {
  try {
    const dom = editor.view.nodeDOM(pos)
    const el = dom instanceof HTMLElement ? dom : (dom as Node)?.parentElement
    const r = safeRect(el ?? null)
    if (r && containerRect) {
      return {
        top: r.top - containerRect.top,
        left: r.left - containerRect.left,
        width: r.width,
        height: r.height,
      }
    }
  } catch {
    // stale pos
  }
  return { top: 0, left: 0, width: 0, height: 0 }
}

const GRIP = 14 // grip thickness in px

function gripRowStyle(box: Box, table: Box): React.CSSProperties {
  return {
    position: 'absolute',
    top: box.top,
    left: table.left - GRIP - 2,
    height: box.height,
    width: GRIP,
    pointerEvents: 'auto',
  }
}

function gripColStyle(box: Box, table: Box): React.CSSProperties {
  return {
    position: 'absolute',
    left: box.left,
    top: table.top - GRIP - 2,
    width: box.width,
    height: GRIP,
    pointerEvents: 'auto',
  }
}

function addColStripStyle(table: Box): React.CSSProperties {
  return {
    position: 'absolute',
    top: table.top,
    left: table.left + table.width + 2,
    height: table.height,
    width: GRIP,
    pointerEvents: 'auto',
  }
}

function addRowStripStyle(table: Box): React.CSSProperties {
  return {
    position: 'absolute',
    left: table.left,
    top: table.top + table.height + 2,
    width: table.width,
    height: GRIP,
    pointerEvents: 'auto',
  }
}
