'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Exported so the order is unit-testable (tests/unit/settings-nav-order.test.ts).
export const SETTINGS_NAV_GROUPS = [
  { href: '/settings/account', label: 'Account' },
  // v0.2.2 #6: Security sits directly under Account (account + its protection
  // read as one pair before workspace/admin sections).
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/workspace', label: 'Workspace' },
  { href: '/settings/admin', label: 'Admin' },
  // A1: admin-only Users page. The link is cosmetic — the page's own requireAdmin
  // redirect is the security boundary; a non-admin who clicks it is sent to '/'.
  { href: '/settings/users', label: 'Users' },
  // backup-sync: promoted top-level Backup page (was /settings/admin/backup).
  { href: '/settings/backup', label: 'Backup' },
  { href: '/settings/developer', label: 'Developer' },
  // B4: Notifications is now visible — SMTP is configured via /settings/admin/smtp.
  { href: '/settings/notifications', label: 'Notifications' },
  // I5: About lives inside the settings shell (was the standalone /whats-new).
  { href: '/settings/about', label: 'About' },
] as const

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="flex w-48 shrink-0 flex-col gap-1">
      {SETTINGS_NAV_GROUPS.map((group) => {
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
