// @vitest-environment jsdom
//
// Unit tests for the applyThemeToDom DOM-mutation helper (src/lib/editor/apply-theme-dom.ts).
//
// The function immediately paints a WorkspaceTheme onto the layout wrapper element
// (the <div data-color-scheme="…"> that (app)/layout.tsx renders server-side) so
// theme/scheme/style changes take visible effect without waiting for a server
// round-trip or router.refresh().

import { afterEach, describe, expect, it } from 'vitest'
import { applyThemeToDom } from '@/lib/editor/apply-theme-dom'
import { DEFAULT_THEME, themeCssVars, type WorkspaceTheme } from '@/lib/editor/theme'

// ── helpers ─────────────────────────────────────────────────────────────────

/** Reset document.body between tests. */
afterEach(() => {
  document.body.innerHTML = ''
})

/** Create and return the layout wrapper element in document.body. */
function setupWrapper(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-color-scheme', 'light')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

// ── core behaviour ───────────────────────────────────────────────────────────

describe('applyThemeToDom — data attributes', () => {
  it('sets data-color-scheme to the theme value', () => {
    const el = setupWrapper({ 'data-color-scheme': 'light' })
    applyThemeToDom({ ...DEFAULT_THEME, colorScheme: 'dark' })
    expect(el.dataset.colorScheme).toBe('dark')
  })

  it('sets data-color-scheme to "system"', () => {
    const el = setupWrapper()
    applyThemeToDom({ ...DEFAULT_THEME, colorScheme: 'system' })
    expect(el.dataset.colorScheme).toBe('system')
  })

  it('adds data-high-contrast="true" when highContrast is on', () => {
    const el = setupWrapper()
    applyThemeToDom({ ...DEFAULT_THEME, highContrast: true })
    expect(el.getAttribute('data-high-contrast')).toBe('true')
  })

  it('removes data-high-contrast when highContrast is off', () => {
    const el = setupWrapper({ 'data-high-contrast': 'true' })
    applyThemeToDom({ ...DEFAULT_THEME, highContrast: false })
    expect(el.hasAttribute('data-high-contrast')).toBe(false)
  })

  it('adds data-font="dyslexic" when dyslexicFont is on', () => {
    const el = setupWrapper()
    applyThemeToDom({ ...DEFAULT_THEME, dyslexicFont: true })
    expect(el.getAttribute('data-font')).toBe('dyslexic')
  })

  it('removes data-font when dyslexicFont is off', () => {
    const el = setupWrapper({ 'data-font': 'dyslexic' })
    applyThemeToDom({ ...DEFAULT_THEME, dyslexicFont: false })
    expect(el.hasAttribute('data-font')).toBe(false)
  })
})

describe('applyThemeToDom — CSS custom properties', () => {
  it('sets --accent from the theme accent', () => {
    const el = setupWrapper()
    const theme: WorkspaceTheme = { ...DEFAULT_THEME, accent: '#7c3aed' }
    applyThemeToDom(theme)
    expect(el.style.getPropertyValue('--accent')).toBe('#7c3aed')
  })

  it('sets every CSS var produced by themeCssVars', () => {
    const el = setupWrapper()
    const theme: WorkspaceTheme = {
      ...DEFAULT_THEME,
      colorScheme: 'dark',
      accent: '#e11d48',
      fontPair: 'serif',
      pageBg: 'sepia',
      highContrast: true,
      dyslexicFont: false,
    }
    applyThemeToDom(theme)

    const vars = themeCssVars(theme)
    for (const [name, value] of Object.entries(vars)) {
      expect(el.style.getPropertyValue(name)).toBe(String(value))
    }
  })

  it('sets --page-bg to the resolved hex for the "sepia" preset', () => {
    const el = setupWrapper()
    applyThemeToDom({ ...DEFAULT_THEME, pageBg: 'sepia' })
    // resolvePageBg('sepia') === '#f5efe0'
    expect(el.style.getPropertyValue('--page-bg')).toBe('#f5efe0')
  })
})

describe('applyThemeToDom — full dark/high-contrast/custom-accent scenario', () => {
  it('correctly mutates all attributes and CSS vars in one call', () => {
    document.body.innerHTML = '<div data-color-scheme="light"></div>'
    const el = document.querySelector('[data-color-scheme]') as HTMLElement

    const theme: WorkspaceTheme = {
      accent: '#e11d48',
      fontPair: 'serif',
      colorScheme: 'dark',
      pageBg: '#fefefe',
      highContrast: true,
      dyslexicFont: false,
      defaultBodyFont: DEFAULT_THEME.defaultBodyFont,
    }

    applyThemeToDom(theme)

    // data attributes
    expect(el.dataset.colorScheme).toBe('dark')
    expect(el.getAttribute('data-high-contrast')).toBe('true')
    expect(el.hasAttribute('data-font')).toBe(false)

    // sample CSS vars
    expect(el.style.getPropertyValue('--accent')).toBe('#e11d48')
    expect(el.style.getPropertyValue('--page-bg')).toBe('#fefefe')
  })
})

describe('applyThemeToDom — edge cases', () => {
  it('is a no-op when no [data-color-scheme] element exists', () => {
    document.body.innerHTML = '<div class="no-theme"></div>'
    // Must not throw
    expect(() => applyThemeToDom(DEFAULT_THEME)).not.toThrow()
  })

  it('targets the FIRST [data-color-scheme] element in document order', () => {
    document.body.innerHTML = `
      <div data-color-scheme="light" id="first"></div>
      <div data-color-scheme="light" id="second"></div>
    `
    applyThemeToDom({ ...DEFAULT_THEME, colorScheme: 'dark' })
    const first = document.getElementById('first') as HTMLElement
    const second = document.getElementById('second') as HTMLElement
    expect(first.dataset.colorScheme).toBe('dark')
    // querySelector returns the first match; second stays unchanged
    expect(second.dataset.colorScheme).toBe('light')
  })
})
