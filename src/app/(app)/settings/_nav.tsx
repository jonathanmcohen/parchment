'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const groups = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/workspace', label: 'Workspace' },
  { href: '/settings/admin', label: 'Admin' },
  // A1: admin-only Users page. The link is cosmetic — the page's own requireAdmin
  // redirect is the security boundary; a non-admin who clicks it is sent to '/'.
  { href: '/settings/users', label: 'Users' },
  { href: '/settings/developer', label: 'Developer' },
  // B4: Notifications is now visible — SMTP is configured via /settings/admin/smtp.
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/security', label: 'Security' },
  // I5: About lives inside the settings shell (was the standalone /whats-new).
  { href: '/settings/about', label: 'About' },
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
                ? 'rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-sm text-[var(--on-primary)]'
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
