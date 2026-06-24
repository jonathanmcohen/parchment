'use client'

import { usePathname } from 'next/navigation'
import { UserCluster } from './UserCluster'

// C1: the layout topbar's account cluster, route-aware.
//
// The (app) layout is an async SERVER component (it awaits requireUser /
// getTranslations) so it cannot read the pathname. This tiny client wrapper
// (mirrors NavRow's pattern) renders the UserCluster on every app route EXCEPT
// the editor (/d/[id]) — there the title bar carries the account menu itself, so
// the layout topbar one would be a duplicate "floating" avatar. Exactly one
// avatar on the editor route (the C1 crux).
export function TopbarUserCluster({
  name,
  labels,
}: {
  name: string
  labels: {
    accountMenu: string
    manageAccount: string
    signOut: string
    switchAccount: string
    theme: string
    themeLight: string
    themeDark: string
    themeSystem: string
  }
}) {
  const pathname = usePathname()
  // Editor route: /d/<id>. The title bar's UserCluster is the only avatar.
  if (pathname === '/d' || pathname.startsWith('/d/')) return null
  return <UserCluster name={name} labels={labels} />
}
