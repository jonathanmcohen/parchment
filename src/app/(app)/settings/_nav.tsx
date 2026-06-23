'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const groups = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/workspace', label: 'Workspace' },
  { href: '/settings/admin', label: 'Admin' },
  { href: '/settings/developer', label: 'Developer' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/security', label: 'Security' },
  // L5: "About" links to the dedicated, linkable What's-new page.
  { href: '/whats-new', label: 'About' },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="flex w-48 shrink-0 flex-col gap-1">
      {groups.map((group) => {
        const active = pathname === group.href || pathname.startsWith(`${group.href}/`)
        return (
          <Link
            key={group.href}
            href={group.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 font-medium text-sm text-white'
                : 'rounded-md px-3 py-1.5 text-[var(--foreground)] text-sm hover:bg-[var(--paper)]'
            }
          >
            {group.label}
          </Link>
        )
      })}
    </nav>
  )
}
