// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TableControlsOverlay } from '@/components/editor/TableControlsOverlay'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// Enable React's act() support for createRoot in this node/jsdom worker.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The overlay renders hover affordances (row/column grips, + strips) over the
// ACTIVE table and a themed row/column menu. These guards pin the load-bearing
// behaviour that jsdom can observe (component-level, not pixel positioning):
//   • read-only gating — no editing chrome when the editor is non-editable
//     (item #6: Reading mode / share renderer must be affordance-free).
//   • when editable + cursor in a table → grips (one per row + one per column)
//     and the two "+" strips are emitted.
//   • the row menu opens and its action buttons fire tableMenuAction (delete row
//     etc.) producing the right table shape.

let container: HTMLDivElement
let editor: Editor
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  editor = new Editor({ extensions: baseExtensions, content: '<p>start</p>' })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  editor.destroy()
  container.remove()
  document.getElementById('parchment-overlay-root')?.remove()
})

function mount() {
  root = createRoot(container)
  act(() => {
    root?.render(createElement(TableControlsOverlay, { editor }))
  })
}

/** Put the cursor inside the first table in the doc. */
function cursorIntoTable() {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name === 'tableCell' && pos < 0) pos = p + 2
  })
  act(() => {
    editor.commands.setTextSelection(pos)
  })
}

function seedTable() {
  act(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()
  })
}

describe('TableControlsOverlay — read-only gating', () => {
  it('renders NO editing chrome when the editor is not editable', () => {
    seedTable()
    editor.setEditable(false)
    cursorIntoTable()
    mount()
    expect(container.querySelector('.parchment-table-grip')).toBeNull()
    expect(container.querySelector('.parchment-table-addstrip')).toBeNull()
  })

  it('renders NO chrome when the selection is outside any table', () => {
    seedTable()
    // insertTable prepends the table, pushing the "start" paragraph after it.
    // Put the cursor in that trailing paragraph (outside any table).
    let outsidePos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.isText && node.text === 'start') outsidePos = p
    })
    expect(outsidePos).toBeGreaterThan(0)
    act(() => editor.commands.setTextSelection(outsidePos))
    mount()
    expect(container.querySelector('.parchment-table-grip')).toBeNull()
  })
})

describe('TableControlsOverlay — affordances when active', () => {
  it('emits one row grip per row and one column grip per column', () => {
    seedTable()
    cursorIntoTable()
    mount()
    const rowGrips = container.querySelectorAll('.parchment-table-grip--row')
    const colGrips = container.querySelectorAll('.parchment-table-grip--col')
    expect(rowGrips.length).toBe(3)
    expect(colGrips.length).toBe(3)
  })

  it('emits an add-row strip and an add-column strip', () => {
    seedTable()
    cursorIntoTable()
    mount()
    expect(container.querySelector('.parchment-table-addstrip--row')).not.toBeNull()
    expect(container.querySelector('.parchment-table-addstrip--col')).not.toBeNull()
  })

  it('clicking the add-column strip adds a column', () => {
    seedTable()
    cursorIntoTable()
    mount()
    const before = countCols()
    const strip = container.querySelector<HTMLButtonElement>('.parchment-table-addstrip--col')
    expect(strip).not.toBeNull()
    act(() => strip?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(countCols()).toBe(before + 1)
  })

  it('clicking the add-row strip adds a row', () => {
    seedTable()
    cursorIntoTable()
    mount()
    const before = countRows()
    const strip = container.querySelector<HTMLButtonElement>('.parchment-table-addstrip--row')
    act(() => strip?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(countRows()).toBe(before + 1)
  })
})

describe('TableControlsOverlay — row/column menu', () => {
  it('opening a row grip menu and clicking "Delete row" removes that row', () => {
    seedTable()
    cursorIntoTable()
    mount()
    // Click the middle row grip (index 1) to open its menu.
    const grip = container.querySelectorAll<HTMLButtonElement>('.parchment-table-grip--row')[1]
    expect(grip).toBeTruthy()
    act(() => grip?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    // The menu portals to the overlay root; find "Delete row".
    const del = findMenuItem('Delete row')
    expect(del, 'Delete row menu item').toBeTruthy()
    const before = countRows()
    act(() => del?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(countRows()).toBe(before - 1)
  })

  it('opening a column grip menu and clicking "Delete column" removes that column', () => {
    seedTable()
    cursorIntoTable()
    mount()
    const grip = container.querySelectorAll<HTMLButtonElement>('.parchment-table-grip--col')[1]
    act(() => grip?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const del = findMenuItem('Delete column')
    expect(del).toBeTruthy()
    const before = countCols()
    act(() => del?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(countCols()).toBe(before - 1)
  })

  it('the row menu offers Insert above / Insert below / header / delete table', () => {
    seedTable()
    cursorIntoTable()
    mount()
    const grip = container.querySelector<HTMLButtonElement>('.parchment-table-grip--row')
    act(() => grip?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(findMenuItem('Insert row above')).toBeTruthy()
    expect(findMenuItem('Insert row below')).toBeTruthy()
    expect(findMenuItem('Toggle header row')).toBeTruthy()
    expect(findMenuItem('Delete table')).toBeTruthy()
  })
})

// ── helpers ──────────────────────────────────────────────────────────────
function countRows(): number {
  let n = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') n += 1
  })
  return n
}

function countCols(): number {
  let cols = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow' && cols === 0) cols = node.childCount
  })
  return cols
}

function findMenuItem(label: string): HTMLElement | undefined {
  // Menu buttons carry a material-icon <span> (its text is the icon name) plus a
  // .px-menu-item-label span. Match on the LABEL span, not the whole textContent.
  const root = document.getElementById('parchment-overlay-root') ?? document.body
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button.px-menu-item')).find(
    (b) => b.querySelector('.px-menu-item-label')?.textContent?.trim() === label,
  )
}
