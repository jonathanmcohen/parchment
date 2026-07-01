// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.8 #1 — the "Default editor font" <select> must carry an accessible name
// (axe select-name / WCAG 2 A) and list the built-in pair default + the
// workspace's self-hosted Google fonts. A missing accessible name failed the
// /settings/workspace a11y e2e; this pins it so it can't regress.

// AppearanceSettings calls useRouter() — stub next/navigation for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
// applyThemeToDom touches the DOM wrapper; a no-op keeps the test focused on markup.
vi.mock('@/lib/editor/apply-theme-dom', () => ({ applyThemeToDom: vi.fn() }))

const fetchMock = vi.fn()

beforeEach(() => {
  // /api/settings/theme → a stored theme; /api/settings/fonts → added fonts.
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/settings/fonts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ fonts: ['Lora'] }) })
    }
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          accent: '#1a73e8',
          fontPair: 'system',
          colorScheme: 'system',
          pageBg: 'white',
          highContrast: false,
          dyslexicFont: false,
          defaultBodyFont: 'pair',
        }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function renderAppearance() {
  const { AppearanceSettings } = await import('@/components/settings/AppearanceSettings')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(AppearanceSettings))
  })
  // allow the two fetch effects to resolve + re-render
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

describe('AppearanceSettings — Default editor font (v0.2.8 #1)', () => {
  it('renders the default-font select with an accessible name', async () => {
    const { container, root } = await renderAppearance()
    const selects = Array.from(container.querySelectorAll('select'))
    const fontSelect = selects.find(
      (s) =>
        s.getAttribute('aria-label') === 'Default editor font' ||
        Array.from(s.options).some((o) => o.textContent?.includes('Font pair default')),
    )
    expect(fontSelect, 'default editor font select present').toBeTruthy()
    // axe select-name: the control itself must carry an accessible name.
    const accessibleName =
      fontSelect?.getAttribute('aria-label') ||
      (fontSelect?.getAttribute('aria-labelledby')
        ? document.getElementById(fontSelect.getAttribute('aria-labelledby') as string)?.textContent
        : null) ||
      (fontSelect?.id ? document.querySelector(`label[for="${fontSelect.id}"]`)?.textContent : null)
    expect(accessibleName, 'select has a non-empty accessible name').toBeTruthy()

    act(() => root.unmount())
  })

  it('lists the pair default plus the workspace Google fonts', async () => {
    const { container, root } = await renderAppearance()
    const fontSelect = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.textContent?.includes('Font pair default')),
    )
    const values = fontSelect ? Array.from(fontSelect.options).map((o) => o.value) : []
    expect(values).toContain('pair')
    expect(values).toContain('Lora')

    act(() => root.unmount())
  })
})
