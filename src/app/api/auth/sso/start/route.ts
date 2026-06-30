import { type NextRequest, NextResponse } from 'next/server'
import { buildStart, discoverOidc } from '@/lib/auth/oidc-client'
import { getOidcConfig, isOidcEnabled } from '@/lib/auth/oidc-config'
import { createOidcFlow } from '@/lib/auth/oidc-flow-repo'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

// Validate a post-login landing path: app-relative ONLY. Reject absolute URLs and
// protocol-relative (`//host`) values → open-redirect guard. Falls back to '/'.
function safeRedirectTo(raw: string | null): string {
  if (!raw) return '/'
  // Must start with a single '/', not '//' (protocol-relative) and contain no scheme.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  if (raw.includes('://')) return '/'
  return raw
}

// GET /api/auth/sso/start — begin the OIDC authorization-code flow.
//   • OIDC disabled/unconfigured → redirect to /login (benign; no IdP redirect).
//   • discovery → PKCE + state + nonce → persist the flow row server-side → 302 to IdP.
// The client only ever receives `state` in the IdP URL; the verifier/nonce stay in the
// DB. redirect_uri is the FIXED server value (oidcRedirectUri), never request-derived.
export async function GET(req: NextRequest) {
  // #1: build user-facing redirects from env.publicUrl (PARCHMENT_PUBLIC_URL), NOT
  // req.nextUrl.origin. Behind a TLS-terminating proxy the request origin is the
  // internal 0.0.0.0:3000 bind, which would land the browser on a dead host.
  if (!(await isOidcEnabled())) {
    return NextResponse.redirect(new URL('/login?sso=unavailable', env.publicUrl))
  }

  const config = await getOidcConfig()
  // isOidcEnabled already checked the secret is present; guard for the type-narrowing.
  if (!config || !config.clientSecret) {
    return NextResponse.redirect(new URL('/login?sso=unavailable', env.publicUrl))
  }

  const redirectTo = safeRedirectTo(req.nextUrl.searchParams.get('redirectTo'))

  let authorizationUrl: string
  try {
    const configuration = await discoverOidc(config)
    const start = await buildStart(configuration, config.scopes)
    await createOidcFlow({
      state: start.state,
      codeVerifier: start.codeVerifier,
      nonce: start.nonce,
      redirectTo,
    })
    authorizationUrl = start.authorizationUrl
  } catch {
    // Discovery / build failure → benign redirect, no detail leaked.
    return NextResponse.redirect(new URL('/login?sso=error', env.publicUrl))
  }

  return NextResponse.redirect(authorizationUrl)
}
