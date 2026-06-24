'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition } from 'react'
import { applyColorScheme } from '@/components/settings/account-theme-handler'
import { DEFAULT_THEME, type WorkspaceTheme } from '@/lib/editor/theme'
import { Avatar } from './Avatar'
import { useMenuDismiss } from './use-menu-dismiss'
import { useMenuKeyboard } from './use-menu-keyboard'

// S2-5: top-right user cluster — a 32px initial-fallback avatar that opens an
// account menu (Manage account / Sign out / Switch account placeholder).
//
// C1: the SAME cluster now renders inside the editor title bar (so the title-bar
// avatar IS this account menu — no separate inert "floating J"), and grows a
// Light/Dark/System Theme submenu that reuses the F1 theme path (applyColorScheme
// → PUT /api/settings/theme → router.refresh()). One theme save+refresh path,
// two entry points (Settings → Account + this menu).
//
// Surfaces EXISTING behavior only:
//   • Manage account → navigate /settings (existing route).
//   • Sign out       → the existing POST /api/auth/logout (the same call the
//     SignOutButton makes — no second sign-out path is authored).
//   • Theme          → applyColorScheme (F1's path, reused — not duplicated).
//   • Switch account → disabled placeholder (single-owner in v0.1; matches the
//     "Shared documents arrive in v0.2" posture). Never silently dropped.
//
// NO app-launcher grid. Keyboard-operable: Esc closes + restores focus (the K3
// lesson); useMenuKeyboard drives roving focus over every [role="menuitem"] —
// the expanded Theme options are plain menuitems so they join that flow with no
// new keyboard code.

interface UserClusterLabels {
  accountMenu: string
  manageAccount: string
  signOut: string
  switchAccount: string
  theme: string
  themeLight: string
  themeDark: string
  themeSystem: string
}

export function UserCluster({
  name,
  labels,
}: {
  name: string
  /**
   * Account-menu copy. Optional: when omitted (e.g. the editor title bar, a
   * client tree with no server-resolved strings to thread) the cluster resolves
   * the same keys via useTranslations('shell') under NextIntlClientProvider.
   */
  labels?: UserClusterLabels
}) {
  const t = useTranslations('shell')
  const l: UserClusterLabels = labels ?? {
    accountMenu: t('accountMenu'),
    manageAccount: t('manageAccount'),
    signOut: t('signOut'),
    switchAccount: t('switchAccount'),
    theme: t('theme'),
    themeLight: t('themeLight'),
    themeDark: t('themeDark'),
    themeSystem: t('themeSystem'),
  }

  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // F1 reuse: hold the FULL stored theme so a scheme change merges over it (never
  // resets accent / font / pageBg / accessibility — the applyColorScheme crux).
  const [theme, setTheme] = useState<WorkspaceTheme>(DEFAULT_THEME)
  const [schemeSaving, setSchemeSaving] = useState(false)

  useMenuDismiss(open, () => setOpen(false), wrapRef, toggleRef)
  useMenuKeyboard(open, menuRef)

  // Reset the submenu whenever the account menu closes, so it always re-opens
  // collapsed (and the roving focus model has a stable item list on open).
  useEffect(() => {
    if (!open) setThemeOpen(false)
  }, [open])

  // Load the full stored theme on first open (mirrors AccountThemeSelect): one
  // GET so the merge is over the user's real theme, not DEFAULT_THEME.
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    let active = true
    fetch('/api/settings/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: Partial<WorkspaceTheme>) => {
        if (!active) return
        // K2/I1 legacy-compat: older stored themes may omit newer fields.
        setTheme({
          accent: data.accent ?? DEFAULT_THEME.accent,
          fontPair: data.fontPair ?? DEFAULT_THEME.fontPair,
          colorScheme: data.colorScheme ?? DEFAULT_THEME.colorScheme,
          pageBg: data.pageBg ?? DEFAULT_THEME.pageBg,
          highContrast: data.highContrast ?? DEFAULT_THEME.highContrast,
          dyslexicFont: data.dyslexicFont ?? DEFAULT_THEME.dyslexicFont,
        })
      })
      .catch(() => {
        // keep DEFAULT_THEME on failure; a save still PUTs a valid full theme.
        loadedRef.current = false
      })
    return () => {
      active = false
    }
  }, [open])

  // ArrowDown/ArrowUp on the closed trigger opens + focuses the menu.
  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  function manageAccount() {
    setOpen(false)
    router.push('/settings')
  }

  function signOut() {
    setOpen(false)
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
    })
  }

  async function chooseScheme(scheme: WorkspaceTheme['colorScheme']) {
    if (schemeSaving) return
    setSchemeSaving(true)
    try {
      // F1's path verbatim: merge over the full theme, PUT, router.refresh().
      const next = await applyColorScheme(theme, scheme, { fetch, router })
      setTheme(next)
    } catch {
      // Surface nothing inline (the menu is transient); the select stays usable.
    } finally {
      setSchemeSaving(false)
    }
  }

  const themeOptions: { value: WorkspaceTheme['colorScheme']; label: string }[] = [
    { value: 'light', label: l.themeLight },
    { value: 'dark', label: l.themeDark },
    { value: 'system', label: l.themeSystem },
  ]

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={l.accountMenu}
        title={name}
        className="rounded-full focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <Avatar name={name} size={32} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={l.accountMenu}
          className="parchment-account-menu absolute end-0 top-[calc(100%+8px)] z-20 flex min-w-[224px] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={name} size={36} />
            <span className="truncate text-[var(--foreground)] text-sm">{name}</span>
          </div>
          <div className="my-1 border-[var(--border)] border-t" />
          {/* menuitems start at tabIndex -1; useMenuKeyboard rolls focus. */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-account-menuitem"
            onClick={manageAccount}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              manage_accounts
            </span>
            {l.manageAccount}
          </button>

          {/* C1: Theme submenu — a menuitem that expands the Light/Dark/System
              options inline. Expanded options are plain [role="menuitem"] so the
              existing roving-tabindex hook navigates them with zero new code. */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-haspopup="menu"
            aria-expanded={themeOpen}
            className="parchment-account-menuitem"
            onClick={() => setThemeOpen((v) => !v)}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              palette
            </span>
            {l.theme}
            <span
              aria-hidden
              className="material-symbols-rounded ms-auto text-[20px] text-[var(--muted)]"
            >
              {themeOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {themeOpen && (
            // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA grouping for a set of menuitemradio options inside a role="menu"; <fieldset> would impose legend/box semantics inappropriate inside a menu.
            <div role="group" aria-label={l.theme} className="flex flex-col">
              {themeOptions.map((opt) => {
                const active = theme.colorScheme === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={active}
                    disabled={schemeSaving}
                    className="parchment-account-menuitem disabled:opacity-60"
                    // Indent under the "Theme" row. Inline style beats the
                    // unlayered .parchment-account-menuitem padding shorthand
                    // (Tailwind ps-* sits in @layer utilities → loses the cascade).
                    style={{ paddingInlineStart: 36 }}
                    onClick={() => void chooseScheme(opt.value)}
                  >
                    <span
                      aria-hidden
                      className="material-symbols-rounded text-[20px]"
                      style={{ visibility: active ? 'visible' : 'hidden' }}
                    >
                      check
                    </span>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-account-menuitem"
            onClick={signOut}
            disabled={pending}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              logout
            </span>
            {l.signOut}
          </button>
          <button
            type="button"
            role="menuitem"
            className="parchment-account-menuitem opacity-50"
            disabled
            aria-disabled="true"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              switch_account
            </span>
            {l.switchAccount}
          </button>
        </div>
      )}
    </div>
  )
}
