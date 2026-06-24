import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyColorScheme } from '@/components/settings/account-theme-handler'
import { DEFAULT_THEME, type WorkspaceTheme } from '@/lib/editor/theme'

// F1: the Account → Appearance scheme control wires onChange to
// PUT /api/settings/theme then router.refresh(). These tests pin the handler's
// contract: it must (1) PUT the chosen scheme merged onto the *full* theme, and
// (2) call router.refresh() so the server-rendered theme re-applies live.

afterEach(() => {
  vi.restoreAllMocks()
})

/** A non-default theme so we can prove the other fields are preserved. */
const CUSTOM_THEME: WorkspaceTheme = {
  accent: '#7c3aed',
  fontPair: 'serif',
  colorScheme: 'system',
  pageBg: 'sepia',
  highContrast: true,
  dyslexicFont: true,
}

describe('F1 — applyColorScheme', () => {
  it('PUTs the chosen scheme merged onto the full theme', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const router = { refresh: vi.fn() }

    const next = await applyColorScheme(CUSTOM_THEME, 'light', {
      fetch: fetchMock as unknown as typeof fetch,
      router,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/settings/theme')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string) as WorkspaceTheme
    // The chosen scheme is applied…
    expect(body.colorScheme).toBe('light')
    // …and every other field of the user's theme is preserved (not clobbered to
    // DEFAULT_THEME by parseTheme on the server).
    expect(body.accent).toBe('#7c3aed')
    expect(body.fontPair).toBe('serif')
    expect(body.pageBg).toBe('sepia')
    expect(body.highContrast).toBe(true)
    expect(body.dyslexicFont).toBe(true)
    // Returns the merged theme it sent.
    expect(next.colorScheme).toBe('light')
  })

  it('calls router.refresh() after a successful PUT', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const router = { refresh: vi.fn() }

    await applyColorScheme(DEFAULT_THEME, 'dark', {
      fetch: fetchMock as unknown as typeof fetch,
      router,
    })

    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('each scheme value cascades through the same PUT path', async () => {
    for (const scheme of ['light', 'dark', 'system'] as const) {
      const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
      const router = { refresh: vi.fn() }
      await applyColorScheme(DEFAULT_THEME, scheme, {
        fetch: fetchMock as unknown as typeof fetch,
        router,
      })
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect((JSON.parse(init.body as string) as WorkspaceTheme).colorScheme).toBe(scheme)
      expect(router.refresh).toHaveBeenCalledTimes(1)
    }
  })

  it('throws and does NOT refresh when the PUT fails', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }))
    const router = { refresh: vi.fn() }

    await expect(
      applyColorScheme(DEFAULT_THEME, 'light', {
        fetch: fetchMock as unknown as typeof fetch,
        router,
      }),
    ).rejects.toThrow()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  // CF1: the thrown error must carry the HTTP status so the component can
  // surface a deploy-time failure (e.g. a 401 behind a proxy) instead of an
  // opaque "try again". This guards the diagnosability fix.
  it('throws an error carrying the HTTP status on a non-2xx PUT', async () => {
    for (const status of [400, 401, 500] as const) {
      const fetchMock = vi.fn(async () => new Response(null, { status }))
      const router = { refresh: vi.fn() }
      await expect(
        applyColorScheme(DEFAULT_THEME, 'dark', {
          fetch: fetchMock as unknown as typeof fetch,
          router,
        }),
      ).rejects.toThrow(`HTTP ${status}`)
    }
  })
})
