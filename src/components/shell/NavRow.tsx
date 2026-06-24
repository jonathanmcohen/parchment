'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { isNavRowActive } from '@/lib/shell/nav'

// S2-1: a single sidebar nav row.
//
// The (app) layout is an async SERVER component (it awaits getTranslations /
// requireUser), so it cannot read the pathname. This tiny client wrapper reads
// usePathname() + useSearchParams() and applies the active pill; the server
// layout passes it the resolved href / icon / label (presentation wiring, not
// feature logic).
//
// Active detection is QUERY-AWARE: the routeless Drive views (Shared/Starred/
// Recents) share the /files route and differ only by ?view=, which usePathname()
// strips. So we also read the `view` search param and hand it to
// isNavRowActive, which lights exactly one row per route/view — the bare Files
// row only on /files with no (or `all`) view, and each ?view= row on its view.
//
// Active pill = the canonical brand tokens (S1): --primary-surface fill +
// --primary text. Idle rows hover to --surface-hover. 36px tall, pill radius,
// 20px Material Symbol + 14px label — the Drive shape.
export function NavRow({ href, icon, label }: { href: string; icon: string; label: string }) {
  const pathname = usePathname()
  const view = useSearchParams().get('view')
  const active = isNavRowActive(pathname, href, view)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex h-9 items-center gap-3 rounded-full px-3 text-sm',
        active
          ? 'bg-[var(--primary-surface)] text-[var(--primary)]'
          : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]',
      ].join(' ')}
    >
      <span aria-hidden className="material-symbols-rounded text-[20px]">
        {icon}
      </span>
      {label}
    </Link>
  )
}
