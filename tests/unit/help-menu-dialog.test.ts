// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelpMenu } from '@/components/help/HelpMenu'

// v0.2.8 #2 — "What's new" and "Keyboard shortcuts" must open as a closable
// POP-OUT dialog OVER the content, not expand inside the sidebar.
//
// The regression cause: the dialogs rendered inside a Backdrop whose class
// (.parchment-help-backdrop) and dialog class (.parchment-help-dialog) had NO CSS
// anywhere — so they were plain in-flow blocks inserted into the sidebar footer
// (where HelpMenu is mounted), i.e. they "extended the sidebar" exactly as reported.
// The fix routes them through the PROVEN shared dialog shell (.parchment-dialog-
// overlay = position:fixed;inset:0 scrim + centered .parchment-dialog), which every
// other dialog (WordCount / PageSetup / …) already uses.
//
// These guards pin (a) that the component emits the shared fixed-overlay wrapper
// with a role=dialog inside it, and (b) that the shell CSS actually exists.

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  try {
    window.localStorage.setItem('parchment:tour-seen', 'true') // suppress auto-tour
  } catch {
    // ignore
  }
})

afterEach(() => {
  container.remove()
})

function render() {
  const root = createRoot(container)
  act(() => {
    root.render(createElement(HelpMenu, {}))
  })
  return root
}

function clickHelpItem(label: string) {
  // The toggle is the sidebar-footer Help button (aria-haspopup); its text node is
  // "Help" but it also contains a material-symbols icon glyph, so match on the role.
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')
  expect(toggle, 'Help toggle button').toBeTruthy()
  act(() => {
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const item = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  )
  expect(item, `menu item: ${label}`).toBeTruthy()
  act(() => {
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe("HelpMenu — What's new / Keyboard shortcuts pop-out", () => {
  it('Keyboard shortcuts opens a fixed-overlay dialog (not an inline sidebar panel)', () => {
    const root = render()
    clickHelpItem('Keyboard shortcuts')

    const dialog = document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')
    expect(dialog, 'shortcuts dialog present').toBeTruthy()

    // The dialog must sit inside the shared fixed-overlay scrim so it floats OVER
    // the content rather than growing the sidebar in-flow.
    const overlay = dialog?.closest('.parchment-dialog-overlay')
    expect(overlay, 'dialog wrapped by shared .parchment-dialog-overlay scrim').toBeTruthy()

    // And it must have a close control.
    const close = dialog?.querySelector('.parchment-dialog-close, [aria-label^="Close"]')
    expect(close, 'dialog has a close button').toBeTruthy()

    act(() => root.unmount())
  })

  it("What's new opens a fixed-overlay dialog with the release list", () => {
    const root = render()
    clickHelpItem("What's new")

    const dialog = document.querySelector('[role="dialog"][aria-label="What\'s new"]')
    expect(dialog, "what's new dialog present").toBeTruthy()
    const overlay = dialog?.closest('.parchment-dialog-overlay')
    expect(overlay, 'dialog wrapped by shared .parchment-dialog-overlay scrim').toBeTruthy()
    expect(dialog?.querySelector('.parchment-release-list'), 'release list rendered').toBeTruthy()

    act(() => root.unmount())
  })
})

describe('HelpMenu dialog CSS shell exists', () => {
  const globalsCss = readFileSync(join(__dirname, '..', '..', 'src/app/globals.css'), 'utf8')

  it('the shared overlay scrim is a fixed full-viewport layer', () => {
    const idx = globalsCss.indexOf('.parchment-dialog-overlay')
    expect(idx).toBeGreaterThanOrEqual(0)
    const body = globalsCss.slice(idx, globalsCss.indexOf('}', idx))
    expect(body).toContain('position: fixed')
    expect(body).toContain('inset: 0')
  })

  it('the help-specific body/table/release/tour classes are styled', () => {
    for (const sel of [
      '.parchment-help-dialog-body',
      '.parchment-shortcuts-table',
      '.parchment-release-list',
      '.parchment-tour-footer',
    ]) {
      expect(globalsCss.includes(sel), `CSS defines ${sel}`).toBe(true)
    }
  })
})
