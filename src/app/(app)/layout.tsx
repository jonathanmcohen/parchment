import Link from 'next/link'
import type { CSSProperties } from 'react'
import { CommandPaletteMount } from '@/components/CommandPaletteMount'
import { HelpMenu } from '@/components/help/HelpMenu'
import { GlobalShortcuts } from '@/components/shortcuts/GlobalShortcuts'
import { requireUser } from '@/lib/auth/guard'
import { SignOutButton } from '@/lib/auth/sign-out-button'
import { getWorkspaceTheme } from '@/lib/docs/settings-repo'
import { themeCssVars } from '@/lib/editor/theme'
import { getShortcutOverrides } from '@/lib/help/keymap-repo'

const nav = [
  { href: '/files', label: 'Files' },
  { href: '/templates', label: 'Templates' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/trash', label: 'Trash' },
  { href: '/settings', label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole app group: unauthenticated visitors are sent to /login.
  const user = await requireUser()

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
        Skip to content
      </a>
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-[var(--border)] border-r bg-[var(--paper)] p-4">
        <Link href="/" className="mb-4 px-2 font-semibold text-lg tracking-tight">
          Parchment
        </Link>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-[var(--foreground)] text-sm hover:bg-[var(--background)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-[var(--border)] border-t pt-4">
          <span className="px-2 text-[var(--muted)] text-xs">{user.name}</span>
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
