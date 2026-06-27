import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

// §5.4 (security fix) — gate the ENTIRE /settings/admin/* subtree behind admin.
// Before this, the audit log, backup, health, schedules, and the new SSO config
// page were reachable by any logged-in user — an info-leak (the audit trail exposes
// actor ids, IPs, and every action) and a privilege hole (backup/SSO config). This
// single layout redirects non-admins (requireAdmin → '/' for under-privileged,
// '/login' for anonymous), using A's canonical role lattice (owner > admin > editor
// > viewer; the banned legacy role name is never consulted). requireAdmin already
// exists in src/lib/auth/guard.ts — this file only adds the gate, not the check.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return children
}
