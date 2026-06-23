import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CSSProperties } from 'react'
import { CommandPaletteMount } from '@/components/CommandPaletteMount'
import { HelpMenu } from '@/components/help/HelpMenu'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { GlobalShortcuts } from '@/components/shortcuts/GlobalShortcuts'
import { requireUser } from '@/lib/auth/guard'
import { SignOutButton } from '@/lib/auth/sign-out-button'
import { getWorkspaceTheme } from '@/lib/docs/settings-repo'
import { themeCssVars } from '@/lib/editor/theme'
import { getShortcutOverrides } from '@/lib/help/keymap-repo'

// K5: nav items pair a route with a message key under the `nav` namespace.
// Labels are resolved per request via getTranslations so the sidebar is
// localized (and the order is preserved when mirrored under dir="rtl").
const nav = [
  { href: '/files', key: 'files' },
  { href: '/templates', key: 'templates' },
  { href: '/inbox', key: 'inbox' },
  { href: '/trash', key: 'trash' },
  { href: '/settings', key: 'settings' },
] as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole app group: unauthenticated visitors are sent to /login.
  const user = await requireUser()

  // K5: localized shell strings (nav labels, skip link, brand). The active
  // locale comes from the NEXT_LOCALE cookie via next-intl's request config.
  const t = await getTranslations()

  // G3: inject the workspace theme's CSS vars so they cascade to all children,
  // overriding the globals.css defaults (--accent-contrast, --font-*).
  const theme = await getWorkspaceTheme(user.id)
  const themeStyle = themeCssVars(theme) as CSSProperties

  // I2: the owner's persisted shortcut overrides, merged with DEFAULT_BINDINGS by
  // the GlobalShortcuts dispatcher (key routing) and the HelpMenu (cheat sheet).
  const shortcutOverrides = await getShortcutOverrides(user.id)

  return (
    <div
      className="flex min-h-screen"
      style={themeStyle}
      data-color-scheme={theme.colorScheme}
      // K2: accessibility toggles — globals.css keys high-contrast var overrides
      // off [data-high-contrast="true"] and the OpenDyslexic font off
      // [data-font="dyslexic"]. Omit the attribute entirely when off so the
      // base/light/dark vars apply unchanged.
      data-high-contrast={theme.highContrast ? 'true' : undefined}
      data-font={theme.dyslexicFont ? 'dyslexic' : undefined}
    >
      <GlobalShortcuts overrides={shortcutOverrides} />
      <CommandPaletteMount />
      {/* K3: skip-to-content — first focusable element, visually hidden until
          focused, jumps keyboard users past the sidebar nav to <main>. */}
      <a href="#main-content" className="parchment-skip-link">
        {t('shell.skipToContent')}
      </a>
      {/* K5/RTL: `border-e` (inline-end) instead of `border-r` so the sidebar
          divider flips to the left edge under dir="rtl". The flex row reverses
          automatically, so the sidebar sits on the right and main on the left. */}
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-[var(--border)] border-e bg-[var(--paper)] p-4">
        <Link href="/" className="mb-4 px-2 font-semibold text-lg tracking-tight">
          {t('shell.appName')}
        </Link>
        <nav aria-label={t('nav.primaryLabel')} className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-[var(--foreground)] text-sm hover:bg-[var(--background)]"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-[var(--border)] border-t pt-4">
          <span className="px-2 text-[var(--muted)] text-xs">{user.name}</span>
          <LocaleSwitcher />
          <HelpMenu shortcutOverrides={shortcutOverrides} />
          <SignOutButton />
        </div>
      </aside>
      <main id="main-content" className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
