// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toolbar } from '@/components/editor/Toolbar'
import { MOBILE_ESSENTIAL_LABELS } from '@/lib/editor/mobile-toolbar'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// v0.2.10 mobile pass — at ≤768px the Toolbar renders a COMPACT essentials row +
// a `⋯` bottom sheet, NOT the full desktop toolbar. These render tests pin:
//   • the compact row contains exactly the essentials (MOBILE_ESSENTIAL_LABELS);
//   • desktop-only controls (font-family / colour / line-height selects) are absent
//     from the row;
//   • the `⋯` opens the themed bottom-sheet dialog with the overflow actions.
//
// matchMedia is stubbed to report the mobile media query as matching so the
// `useIsMobile` branch engages under jsdom (which has no real viewport).

let editor: Editor
let container: HTMLDivElement

// The ~25 handler props the Toolbar requires — all no-ops for a structural render.
function noopProps() {
  return {
    onInsertImage: () => {},
    onOpenLink: () => {},
    onCropImage: () => {},
    onOpenPageSetup: () => {},
    onOpenWatermark: () => {},
    onOpenCustomCss: () => {},
    onToggleComments: () => {},
    commentsSidebarOpen: false,
    onAddComment: () => {},
    onToggleVersionHistory: () => {},
    versionHistoryOpen: false,
    onToggleSuggestions: () => {},
    suggestionsOpen: false,
    onToggleBacklinks: () => {},
    backlinksOpen: false,
    onSaveAsTemplate: () => {},
    onOpenShare: () => {},
    onToggleReading: () => {},
    readingOpen: false,
    onTogglePresenter: () => {},
    presenterOpen: false,
    onExportPdf: () => {},
    onToggleSourceMode: () => {},
    sourceModeOpen: false,
    sourceModeDisabled: false,
  }
}

beforeEach(() => {
  // jsdom lacks ResizeObserver; the toolbar's (unconditional) desktop-overflow
  // effect constructs one. A no-op stub lets the component mount under jsdom.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // Force the mobile media query to match.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: /max-width/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
  // The toolbar fetches picked Google fonts on mount — stub it.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ fonts: [] }) }) as unknown as Response),
  )
  editor = new Editor({ extensions: baseExtensions, content: '<p>hello world</p>' })
  container = document.createElement('div')
  container.setAttribute('data-color-scheme', 'light')
  document.body.appendChild(container)
})

afterEach(() => {
  editor.destroy()
  container.remove()
  document.getElementById('parchment-overlay-root')?.remove()
  document.body.removeAttribute('style')
  vi.unstubAllGlobals()
})

function renderToolbar() {
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Toolbar, { editor, ...noopProps() }))
  })
  return root
}

function toolbarEl() {
  return container.querySelector<HTMLElement>('[role="toolbar"]')
}

describe('Toolbar mobile branch', () => {
  it('renders the compact mobile toolbar variant', () => {
    const root = renderToolbar()
    const tb = toolbarEl()
    expect(tb, 'toolbar present').toBeTruthy()
    expect(tb?.classList.contains('parchment-toolbar--mobile')).toBe(true)
    act(() => root.unmount())
  })

  it('shows every essential control in the compact row', () => {
    const root = renderToolbar()
    const tb = toolbarEl()
    const names = new Set(
      Array.from(tb?.querySelectorAll('[aria-label]') ?? []).map((el) =>
        el.getAttribute('aria-label'),
      ),
    )
    // Styles is a dropdown whose trigger shows the text "Styles" (no aria-label);
    // check the row's text for it, and the rest by aria-label.
    for (const [id, label] of Object.entries(MOBILE_ESSENTIAL_LABELS)) {
      if (id === 'styles') {
        expect(tb?.textContent, 'Styles trigger').toContain('Styles')
      } else {
        expect(names.has(label), `essential control: ${label}`).toBe(true)
      }
    }
    // And the `⋯` trigger.
    expect(names.has('More tools'), '⋯ trigger').toBe(true)
    act(() => root.unmount())
  })

  it('does NOT render the desktop font/colour/size selects inline in the row', () => {
    const root = renderToolbar()
    const tb = toolbarEl()
    // These are desktop-only chrome; on mobile they live nowhere in the compact row.
    expect(tb?.querySelector('#toolbar-font-family')).toBeNull()
    expect(tb?.querySelector('#toolbar-color')).toBeNull()
    expect(tb?.querySelector('#toolbar-line-height')).toBeNull()
    // No horizontal-scroll safety valve needed → the row is not a scroller.
    act(() => root.unmount())
  })

  it('opens the themed bottom sheet from the `⋯` trigger', () => {
    const root = renderToolbar()
    const more = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === 'More tools',
    )
    expect(more, '⋯ button').toBeTruthy()
    act(() => {
      more?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const overlayRoot = document.getElementById('parchment-overlay-root')
    const dialog = overlayRoot?.querySelector('[role="dialog"][aria-modal="true"]')
    expect(dialog, 'bottom sheet dialog opened in overlay root').toBeTruthy()
    // The sheet carries the overflow actions (e.g. Print, Share).
    const labels = Array.from(dialog?.querySelectorAll('[role="menuitem"]') ?? []).map(
      (b) => b.textContent ?? '',
    )
    expect(
      labels.some((l) => l.includes('Print')),
      'sheet has Print',
    ).toBe(true)
    expect(
      labels.some((l) => l.includes('Share')),
      'sheet has Share',
    ).toBe(true)
    act(() => root.unmount())
  })
})
