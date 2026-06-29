import { NextResponse } from 'next/server'
import { userHasOidcIdentity } from '@/lib/auth/oidc-account'
import { buildEndSessionRedirect, discoverOidc } from '@/lib/auth/oidc-client'
import { getOidcConfig, isOidcEnabled } from '@/lib/auth/oidc-config'
import { destroySession, getCurrentUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// Clears the current session (deletes the row + unsets the cookie). POST only —
// a GET would be CSRF-triggerable from a third-party page.
//
// #9 (RP-initiated single-logout): if the current user signed in via OIDC AND the
// IdP advertises an end_session_endpoint, return the end-session URL so the client
// redirects the browser there to also terminate the IdP session (preventing a
// silent SSO re-login). post_logout_redirect_uri = <publicUrl>/login. If anything
// is missing or fails, fall back to a plain local logout. The local session is
// ALWAYS destroyed either way.
export async function POST() {
  // Resolve OIDC single-logout BEFORE destroying the session (we need the user).
  // Best-effort: any failure here must never block the local logout below.
  let redirectTo: string | null = null
  try {
    const user = await getCurrentUser()
    if (user && (await userHasOidcIdentity(user.id)) && (await isOidcEnabled())) {
      const config = await getOidcConfig()
      if (config) {
        const configuration = await discoverOidc(config)
        redirectTo = buildEndSessionRedirect(configuration)
      }
    }
  } catch {
    // Discovery / config failure → local logout only.
    redirectTo = null
  }

  await destroySession()

  // The client redirects to `redirectTo` when present (the IdP end-session URL),
  // otherwise it navigates to /login itself.
  return NextResponse.json({ ok: true, ...(redirectTo ? { redirectTo } : {}) })
}
