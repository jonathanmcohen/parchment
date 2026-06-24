import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CSSProperties } from 'react'
import { CommandPaletteMount } from '@/components/CommandPaletteMount'
import { HelpMenu } from '@/components/help/HelpMenu'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { AppShell } from '@/components/shell/AppShell'
import { Avatar } from '@/components/shell/Avatar'
import { NavRow } from '@/components/shell/NavRow'
import { NewMenu } from '@/components/shell/NewMenu'
import { UserCluster } from '@/components/shell/UserCluster'
import { GlobalShortcuts } from '@/components/shortcuts/GlobalShortcuts'
import { requireUser } from '@/lib/auth/guard'
import { SignOutButton } from '@/lib/auth/sign-out-button'
import { getWorkspaceTheme } from '@/lib/docs/settings-repo'
import { themeCssVars } from '@/lib/editor/theme'
import { getShortcutOverrides } from '@/lib/help/keymap-repo'

// S2-1/S2-4: nav items pair a route with a message key and a Material Symbol.
// Drive shape — 8 rows. `Files`/`Trash`/`Templates`/`Inbox`/`Settings` are real
// routes; `Recents`/`Shared`/`Starred` are routeless Drive views surfaced inside
// /files via `?view=` (S2-4 PARTIAL — no dedicated /recents, /shared or /starred
// route yet). All five FileManager views (All via /files, plus Recents/Starred/
// Shared via `?view=`, and Trash via /trash) are reachable from the sidebar —
// no navless gap. Labels are resolved per request via getTranslations
// (K5: localized + RTL).
const nav = [
  { href: '/files', key: 'files', icon: 'folder' },
  { href: '/files?view=recents', key: 'recents', icon: 'schedule' },
  { href: '/templates', key: 'templates', icon: 'grid_view' },
  { href: '/inbox', key: 'inbox', icon: 'inbox' },
  { href: '/files?view=shared', key: 'shared', icon: 'group' },
  { href: '/files?view=starred', key: 'starred', icon: 'star' },
  { href: '/trash', key: 'trash', icon: 'delete' },
  { href: '/settings', key: 'settings', icon: 'settings' },
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

  const sidebar = (
    <>
      {/* S2-3: wordmark — explicit --foreground 16px semibold, optional glyph. */}
      <Link
        href="/"
        className="mb-2 flex h-14 items-center gap-2 px-2 font-semibold text-[16px] text-[var(--foreground)] tracking-tight"
      >
        <span aria-hidden className="parchment-logo-glyph" />
        {t('shell.appName')}
      </Link>

      {/* S2-1: "+ New" mega-menu surfacing existing create actions. */}
      <NewMenu
        labels={{
          new: t('shell.new'),
          blankDocument: t('shell.blankDocument'),
          fromTemplate: t('shell.fromTemplate'),
          folder: t('shell.folder'),
          upload: t('shell.upload'),
        }}
      />

      <nav aria-label={t('nav.primaryLabel')} className="mt-2 flex flex-col gap-1">
        {nav.map((item) => (
          <NavRow key={item.href} href={item.href} icon={item.icon} label={t(`nav.${item.key}`)} />
        ))}
      </nav>

      {/* S2-2: bottom cluster — reads as secondary (muted). */}
      <div className="mt-auto flex flex-col gap-1 border-[var(--border)] border-t pt-4">
        <span className="flex items-center gap-2 px-2 text-[var(--muted)] text-xs">
          <Avatar name={user.name} size={24} />
          <span className="truncate">{user.name}</span>
        </span>
        <LocaleSwitcher />
        <HelpMenu shortcutOverrides={shortcutOverrides} />
        <SignOutButton className="rounded-md px-2 py-1.5 text-left text-[var(--muted)] text-sm hover:bg-[var(--surface-hover)] hover:text-[var(--error)] disabled:opacity-60" />
      </div>
    </>
  )

  return (
    <div
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
      <AppShell
        sidebar={sidebar}
        topbarRight={
          <UserCluster
            name={user.name}
            labels={{
              accountMenu: t('shell.accountMenu'),
              manageAccount: t('shell.manageAccount'),
              signOut: t('shell.signOut'),
              switchAccount: t('shell.switchAccount'),
            }}
          />
        }
        menuLabels={{ openNav: t('shell.openNav'), closeNav: t('shell.closeNav') }}
      >
        {children}
      </AppShell>
    </div>
  )
}
