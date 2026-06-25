import { describe, expect, it, vi } from 'vitest'
import { applyColorScheme } from '@/components/settings/account-theme-handler'
import { DEFAULT_THEME, type WorkspaceTheme } from '@/lib/editor/theme'

// Regression coverage for the Account → Appearance theme save. The handler is
// shared by two entry points (Settings → Account's AccountThemeSelect and the
// user-menu Theme submenu in UserCluster), both of which pass `{ fetch, router }`.
//
// THE BUG (live, screenshot-confirmed on the deploy): the handler called
// `deps.fetch(...)` as a MEMBER, which binds `this` to the `deps` object. The
// platform window.fetch rejects a non-global `this` with
//   "Failed to execute 'fetch' on 'Window': Illegal invocation"
// so every theme change on the Account page (and in the avatar menu) failed —
// while the Workspace page worked because it calls the global `fetch` directly.
// A plain vi.fn() mock can't reproduce that (it ignores `this`), so the binding
// test below uses a strict mock that records the `this` it was invoked with.

const okResponse = () => ({ ok: true, status: 200 }) as Response

const router = () => ({ refresh: vi.fn() })

describe('applyColorScheme — fetch this-binding (Illegal invocation regression)', () => {
  it('does NOT invoke fetch with `this` bound to the deps object', async () => {
    let capturedThis: unknown = 'unset'
    // A non-arrow function so it observes its own `this` at call time, mirroring
    // how the real window.fetch inspects `this` before doing anything.
    const strictFetch = function (this: unknown): Promise<Response> {
      capturedThis = this
      return Promise.resolve(okResponse())
    } as unknown as typeof fetch

    const deps = { fetch: strictFetch, router: router() }
    await applyColorScheme(DEFAULT_THEME, 'dark', deps)

    // The buggy `deps.fetch(...)` made this === deps. The fix hoists to a local,
    // so the unqualified call leaves `this` === undefined (which platform fetch
    // accepts). The invariant that matters: never the deps object.
    expect(capturedThis).not.toBe(deps)
    expect(capturedThis).toBeUndefined()
  })

  it('PUTs the FULL merged theme (scheme over current) so accent/font/pageBg survive', async () => {
    const fetchMock = vi.fn(async () => okResponse()) as unknown as typeof fetch
    const current: WorkspaceTheme = {
      ...DEFAULT_THEME,
      accent: '#7c3aed',
      fontPair: 'serif',
      pageBg: 'sepia',
    }
    const r = router()

    const result = await applyColorScheme(current, 'dark', { fetch: fetchMock, router: r })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls
    const [url, init] = calls[0] as [string, RequestInit]
    expect(url).toBe('/api/settings/theme')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string)
    // colorScheme updated; every other field preserved (the parseTheme-clobber crux).
    expect(body).toMatchObject({
      colorScheme: 'dark',
      accent: '#7c3aed',
      fontPair: 'serif',
      pageBg: 'sepia',
    })
    // router.refresh() is mandatory — themeCssVars + data-color-scheme are
    // server-rendered, so the new scheme only applies after the RSC re-fetch.
    expect(r.refresh).toHaveBeenCalledTimes(1)
    expect(result.colorScheme).toBe('dark')
  })

  it('throws a status-bearing error and does NOT refresh when the PUT fails', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 401 }) as Response,
    ) as unknown as typeof fetch
    const r = router()

    await expect(
      applyColorScheme(DEFAULT_THEME, 'light', { fetch: fetchMock, router: r }),
    ).rejects.toThrow(/401/)
    expect(r.refresh).not.toHaveBeenCalled()
  })
})

// P8 (v0.1.7): a live observation suggested a SECOND theme change might not
// apply. Investigation found the handler is correct — it has NO value-equality
// guard or cached-state short-circuit, so every call fully persists + refreshes
// (the observation was a synthetic-event/test-harness artifact, not a defect).
// These tests lock that invariant in so a future "skip when unchanged"
// optimization can't silently swallow a repeated change without updating them.
describe('applyColorScheme — repeated/sequential changes each apply (P8)', () => {
  it('PUTs + refreshes on EVERY call with no short-circuit (light→dark→light)', async () => {
    const fetchMock = vi.fn(async () => okResponse()) as unknown as typeof fetch
    const r = router()

    let theme = await applyColorScheme(DEFAULT_THEME, 'light', { fetch: fetchMock, router: r })
    theme = await applyColorScheme(theme, 'dark', { fetch: fetchMock, router: r })
    theme = await applyColorScheme(theme, 'light', { fetch: fetchMock, router: r })

    // No swallowed second/third change — each persisted and re-rendered.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(r.refresh).toHaveBeenCalledTimes(3)
    expect(theme.colorScheme).toBe('light')
  })

  it('does NOT short-circuit even when the chosen scheme equals the current one', async () => {
    const fetchMock = vi.fn(async () => okResponse()) as unknown as typeof fetch
    const r = router()

    const dark: WorkspaceTheme = { ...DEFAULT_THEME, colorScheme: 'dark' }
    await applyColorScheme(dark, 'dark', { fetch: fetchMock, router: r })
    await applyColorScheme(dark, 'dark', { fetch: fetchMock, router: r })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.refresh).toHaveBeenCalledTimes(2)
  })
})
