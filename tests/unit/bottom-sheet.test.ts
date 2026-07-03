// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BottomSheet } from '@/components/editor/menus/BottomSheet'

// v0.2.10 mobile pass — the toolbar `⋯` opens a themed, focus-trapped bottom sheet
// holding the non-essential controls. It reuses the established overlay patterns:
// portals to the body-level `#parchment-overlay-root` (carrying the theme attrs),
// role=dialog + aria-modal, Esc / scrim close.

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  container.setAttribute('data-color-scheme', 'dark')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  document.getElementById('parchment-overlay-root')?.remove()
  // release any body-scroll lock left by an unclosed sheet
  document.body.removeAttribute('style')
})

function renderSheet(props: Partial<Parameters<typeof BottomSheet>[0]> = {}) {
  const onClose = props.onClose ?? (() => {})
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(BottomSheet, {
        open: true,
        title: 'More tools',
        onClose,
        items: [
          { label: 'Print', icon: 'print', onSelect: () => {} },
          { label: 'Strikethrough', icon: 'format_strikethrough', onSelect: () => {} },
          { kind: 'separator' as const },
          { label: 'Share', icon: 'share', onSelect: () => {} },
        ],
        ...props,
      }),
    )
  })
  return root
}

describe('BottomSheet', () => {
  it('portals into the themed #parchment-overlay-root (not the local container)', () => {
    const root = renderSheet()
    const overlayRoot = document.getElementById('parchment-overlay-root')
    expect(overlayRoot, 'overlay root created').toBeTruthy()
    const dialog = overlayRoot?.querySelector('[role="dialog"]')
    expect(dialog, 'dialog lives inside the overlay root').toBeTruthy()
    // the overlay root mirrors the active theme attr so dark tokens resolve
    expect(overlayRoot?.getAttribute('data-color-scheme')).toBe('dark')
    act(() => root.unmount())
  })

  it('is an aria-modal dialog with an accessible name', () => {
    const root = renderSheet()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBe('More tools')
    act(() => root.unmount())
  })

  it('renders each action item as a menuitem (separators are not items)', () => {
    const root = renderSheet()
    const dialog = document.querySelector('[role="dialog"]')
    const items = dialog?.querySelectorAll('[role="menuitem"]')
    expect(items?.length).toBe(3) // Print, Strikethrough, Share (separator excluded)
    const labels = Array.from(items ?? []).map((b) => b.textContent)
    expect(labels.some((l) => l?.includes('Print'))).toBe(true)
    expect(labels.some((l) => l?.includes('Share'))).toBe(true)
    act(() => root.unmount())
  })

  it('invokes the item handler and then closes when an action is tapped', () => {
    let picked = ''
    let closed = false
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(BottomSheet, {
          open: true,
          title: 'More tools',
          onClose: () => {
            closed = true
          },
          items: [
            {
              label: 'Print',
              icon: 'print',
              onSelect: () => {
                picked = 'print'
              },
            },
          ],
        }),
      )
    })
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((b) =>
      b.textContent?.includes('Print'),
    )
    act(() => {
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(picked).toBe('print')
    expect(closed, 'sheet requests close after an action').toBe(true)
    act(() => root.unmount())
  })

  it('closes when the scrim is clicked', () => {
    let closed = false
    const root = renderSheet({
      onClose: () => {
        closed = true
      },
    })
    const scrim = document.querySelector('.parchment-bottom-sheet-scrim')
    expect(scrim, 'scrim present').toBeTruthy()
    act(() => {
      scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(closed).toBe(true)
    act(() => root.unmount())
  })

  it('closes on Escape', () => {
    let closed = false
    const root = renderSheet({
      onClose: () => {
        closed = true
      },
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closed).toBe(true)
    act(() => root.unmount())
  })

  it('renders nothing when closed', () => {
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(BottomSheet, {
          open: false,
          title: 'More tools',
          onClose: () => {},
          items: [{ label: 'Print', onSelect: () => {} }],
        }),
      )
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => root.unmount())
  })
})

describe('BottomSheet CSS shell exists', () => {
  const globalsCss = readFileSync(join(__dirname, '..', '..', 'src/app/globals.css'), 'utf8')

  it('the sheet + scrim are styled and the sheet respects the bottom safe-area inset', () => {
    expect(globalsCss.includes('.parchment-bottom-sheet')).toBe(true)
    expect(globalsCss.includes('.parchment-bottom-sheet-scrim')).toBe(true)
    // iOS safe-area at the bottom edge (spec item 5).
    const idx = globalsCss.indexOf('.parchment-bottom-sheet {')
    expect(idx).toBeGreaterThanOrEqual(0)
    const body = globalsCss.slice(idx, globalsCss.indexOf('}', idx))
    expect(body).toContain('safe-area-inset-bottom')
  })
})
