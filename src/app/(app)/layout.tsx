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
import { ParchmentLogo } from '@/components/shell/ParchmentLogo'
import { TopbarUserCluster } from '@/components/shell/TopbarUserCluster'
import { GlobalShortcuts } from '@/components/shortcuts/GlobalShortcuts'
import { requireUser } from '@/lib/auth/guard'
import { SignOutButton } from '@/lib/auth/sign-out-button'
import { getWorkspaceTheme } from '@/lib/docs/settings-repo'
import { themeCssVars } from '@/lib/editor/theme'
import { getShortcutOverrides } from '@/lib/help/keymap-repo'
import { isMaintenanceMode } from '@/lib/maintenance'

// S2-2 polish (v0.1.9): the sidebar footer is a cohesive cluster of nav-row-
// height controls separated by a hairline from the nav above. Controls share:
//   • parchment-footer-row  — 36px, rounded-full, icon+label, --surface-hover
//   • parchment-footer-locale-row — same height, inline icon+select
// Account row links to /settings and uses the Avatar + user name.
// Sign-out is a dedicated footer row with a logout icon (danger hover).

// S2-1/S2-4: nav items pair a route with a message key and a Material Symbol.
// Drive shape — 8 rows. `Files`/`Templates`/`Inbox`/`Settings` are real routes;
// `Recents`/`Shared`/`Starred`/`Trash` are routeless Drive views surfaced inside
// /files via `?view=` (S2-4). All five FileManager views (All via /files, plus
// Recents/Starred/Shared/Trash via `?view=`) are reachable from the sidebar —
// no navless gap. Labels are resolved per request via getTranslations
// (K5: localized + RTL).
const nav = [
  { href: '/files', key: 'files', icon: 'folder' },
  { href: '/files?view=recents', key: 'recents', icon: 'schedule' },
  { href: '/templates', key: 'templates', icon: 'grid_view' },
  { href: '/graph', key: 'graph', icon: 'hub' },
  { href: '/inbox', key: 'inbox', icon: 'inbox' },
  { href: '/files?view=shared', key: 'shared', icon: 'group' },
  { href: '/files?view=starred', key: 'starred', icon: 'star' },
  { href: '/files?view=trash', key: 'trash', icon: 'delete' },
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
  // #8 (v0.1.9): expose the selected page background as a data attribute on the
  // theme wrapper (ancestor of the editor). 'dark' drives the dark-page-only CSS
  // overrides (link colour, code-block header control ink) AND is read by the
  // Shiki decoration plugin to flip default code blocks to the github-dark theme.
  // 'light' covers white / sepia / any custom-hex sheet (all light surfaces).
  const pageBgKind = theme.pageBg === 'dark' ? 'dark' : 'light'

  // I2: the owner's persisted shortcut overrides, merged with DEFAULT_BINDINGS by
  // the GlobalShortcuts dispatcher (key routing) and the HelpMenu (cheat sheet).
  const shortcutOverrides = await getShortcutOverrides(user.id)

  const maintenanceActive = await isMaintenanceMode()

  const sidebar = (
    <>
      {/* S2-3: wordmark — explicit --foreground 16px semibold, optional glyph. */}
      <Link
        href="/"
        className="mb-2 flex h-14 items-center gap-2 px-2 font-semibold text-[16px] text-[var(--foreground)] tracking-tight"
      >
        <ParchmentLogo size={22} />
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

      {/* S4-4: sidebar nav gap reads the --space-1 (4px) spacing token. */}
      <nav aria-label={t('nav.primaryLabel')} className="mt-2 flex flex-col gap-[var(--space-1)]">
        {nav.map((item) => (
          <NavRow key={item.href} href={item.href} icon={item.icon} label={t(`nav.${item.key}`)} />
        ))}
      </nav>

      {/* S2-2 (polished v0.1.9): cohesive footer cluster. All rows are 36px tall
          and share the nav-row pill shape — account, locale, help, sign-out. */}
      <div className="mt-auto flex flex-col gap-[var(--space-1)] border-[var(--border)] border-t pt-3">
        {/* Account row — avatar + name, links to settings for account management. */}
        <Link href="/settings" className="parchment-footer-row">
          <Avatar name={user.name} size={24} />
          <span className="truncate text-sm">{user.name}</span>
        </Link>
        <LocaleSwitcher />
        <HelpMenu shortcutOverrides={shortcutOverrides} />
        <SignOutButton className="parchment-footer-row parchment-footer-row--danger" />
      </div>
    </>
  )

  return (
    <div
      style={themeStyle}
      data-color-scheme={theme.colorScheme}
      // #8: 'dark' enables the dark-document-page CSS overrides + Shiki dark theme.
      data-page-bg={pageBgKind}
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
      {/* I6: maintenance-mode banner — injected server-side when the lock file exists. */}
      {maintenanceActive && (
        <div
          role="alert"
          data-testid="maintenance-banner"
          style={{
            background: 'var(--warning, #b45309)',
            color: '#fff',
            padding: '8px 16px',
            fontSize: '0.875rem',
            fontWeight: 500,
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 9999,
          }}
        >
          Maintenance mode is active. The workspace is read-only until an admin disables it.
        </div>
      )}
      <AppShell
        sidebar={sidebar}
        topbarRight={
          <TopbarUserCluster
            name={user.name}
            labels={{
              accountMenu: t('shell.accountMenu'),
              manageAccount: t('shell.manageAccount'),
              signOut: t('shell.signOut'),
              switchAccount: t('shell.switchAccount'),
              theme: t('shell.theme'),
              themeLight: t('shell.themeLight'),
              themeDark: t('shell.themeDark'),
              themeSystem: t('shell.themeSystem'),
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
