// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppShell } from '@/components/shell/AppShell'

// v0.2.10 mobile pass — the AppShell sidebar becomes an off-canvas drawer behind a
// hamburger at ≤768px. This pins the drawer's modal semantics + open/close wiring:
// hamburger toggles it, the open drawer is an aria-modal dialog, Esc + scrim close
// it. (The slide-in/scrim visuals are CSS-gated media rules verified separately;
// jsdom has no layout so we assert the ARIA/state contract, not pixels.)

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  document.body.removeAttribute('style')
})

const LABELS = { openNav: 'Open navigation', closeNav: 'Close navigation' }

function renderShell() {
  const root = createRoot(container)
  act(() => {
    root.render(
      // AppShell's props type requires `children` (it's a layout wrapper), so it is
      // passed in the props object here for TS.
      createElement(AppShell, {
        sidebar: createElement('nav', { 'aria-label': 'Primary' }, [
          createElement('a', { key: 'a', href: '/files' }, 'Files'),
          createElement('a', { key: 'b', href: '/settings' }, 'Settings'),
        ]),
        topbarRight: createElement('div', {}, 'user'),
        menuLabels: LABELS,
        // biome-ignore lint/correctness/noChildrenProp: AppShell's props type requires children (TS)
        children: createElement('main', {}, 'content'),
      }),
    )
  })
  return root
}

function hamburger() {
  return container.querySelector<HTMLButtonElement>('.parchment-menu-toggle')
}
function shell() {
  return container.querySelector<HTMLElement>('.parchment-app-shell')
}
function aside() {
  return container.querySelector<HTMLElement>('.parchment-sidebar')
}

describe('AppShell drawer', () => {
  it('starts closed: no data-drawer-open, hamburger aria-expanded=false', () => {
    const root = renderShell()
    expect(shell()?.hasAttribute('data-drawer-open')).toBe(false)
    expect(hamburger()?.getAttribute('aria-expanded')).toBe('false')
    expect(hamburger()?.getAttribute('aria-label')).toBe('Open navigation')
    act(() => root.unmount())
  })

  it('opens on hamburger click: data-drawer-open set, aria-expanded=true', () => {
    const root = renderShell()
    act(() => {
      hamburger()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(shell()?.hasAttribute('data-drawer-open')).toBe(true)
    expect(hamburger()?.getAttribute('aria-expanded')).toBe('true')
    expect(hamburger()?.getAttribute('aria-label')).toBe('Close navigation')
    act(() => root.unmount())
  })

  it('marks the OPEN sidebar as an aria-modal dialog with an accessible name', () => {
    const root = renderShell()
    // closed → not a modal dialog (it is a plain rail at desktop)
    expect(aside()?.getAttribute('aria-modal')).not.toBe('true')
    act(() => {
      hamburger()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aside()?.getAttribute('role')).toBe('dialog')
    expect(aside()?.getAttribute('aria-modal')).toBe('true')
    expect(aside()?.getAttribute('aria-label')).toBeTruthy()
    act(() => root.unmount())
  })

  it('closes on Escape', () => {
    const root = renderShell()
    act(() => {
      hamburger()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(shell()?.hasAttribute('data-drawer-open')).toBe(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(shell()?.hasAttribute('data-drawer-open')).toBe(false)
    act(() => root.unmount())
  })

  it('closes when the scrim is clicked', () => {
    const root = renderShell()
    act(() => {
      hamburger()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const scrim = container.querySelector<HTMLElement>('.parchment-scrim')
    expect(scrim).toBeTruthy()
    act(() => {
      scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(shell()?.hasAttribute('data-drawer-open')).toBe(false)
    act(() => root.unmount())
  })
})
