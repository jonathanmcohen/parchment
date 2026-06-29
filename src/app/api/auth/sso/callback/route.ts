import { type NextRequest, NextResponse } from 'next/server'
import { logAuditRequest } from '@/lib/audit'
import { resolveOidcUser } from '@/lib/auth/oidc-account'
import { discoverOidc, exchangeCallback } from '@/lib/auth/oidc-client'
import { getOidcConfig, isOidcEnabled } from '@/lib/auth/oidc-config'
import { consumeOidcFlow } from '@/lib/auth/oidc-flow-repo'
import { createSession } from '@/lib/auth/session'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

// GET /api/auth/sso/callback — the SSO security core. Defended attacks:
//   • CSRF: `state` is server-side + SINGLE-USE (consumeOidcFlow atomically deletes the
//     row; a replayed callback finds nothing). The verifier/nonce come from the DB row,
//     never the client.
//   • authorization-code injection: PKCE (code_verifier ↔ code_challenge).
//   • ID-token forgery: JWKS signature + iss/aud(==clientId)/exp checks (openid-client).
//   • replay: nonce claim == stored nonce, plus single-use state.
//   • open redirect: redirectTo was validated app-relative at /start (re-validated here).
//   • account takeover via email: link gated on email_verified + (issuer,subject) key.
//   • disabled-account bypass (§7j): resolveOidcUser rejects a disabled user BEFORE any
//     session/identity write.
//   • client-secret exposure: encrypted at rest (secret-box), never logged; fixed
//     redirect_uri from PARCHMENT_PUBLIC_URL prevents code exfiltration to an attacker
//     host.
// Any failure → a generic 401 redirect to /login; a session is NEVER created on error.

function fail(_req: NextRequest, code: string): NextResponse {
  // #1: redirect to the PUBLIC host, not the internal request origin (0.0.0.0:3000
  // behind a TLS-terminating proxy). The request arg is retained for the signature
  // (callers pass it) but the origin is no longer derived from it.
  return NextResponse.redirect(new URL(`/login?sso=${code}`, env.publicUrl))
}

// App-relative only (defense in depth; /start already validated).
function safeRedirectTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return '/'
  return raw
}

export async function GET(req: NextRequest) {
  if (!(await isOidcEnabled())) return fail(req, 'unavailable')

  const state = req.nextUrl.searchParams.get('state')
  if (!state) return fail(req, 'invalid')

  // ATOMIC single-use consumption: deletes + returns the row only if it exists AND is
  // unexpired. A forged/replayed/expired callback gets null → reject. This is the
  // CSRF/state defense — verifier + nonce come from THIS row, never the client.
  const flow = await consumeOidcFlow(state)
  if (!flow) return fail(req, 'invalid')

  const config = await getOidcConfig()
  if (!config || !config.clientSecret) return fail(req, 'unavailable')

  let claims: Awaited<ReturnType<typeof exchangeCallback>>
  try {
    const configuration = await discoverOidc(config)
    // openid-client requires a plain URL instance; req.nextUrl is a NextURL proxy,
    // so pass a fresh URL built from the full request URL (carries ?state&code).
    claims = await exchangeCallback({
      configuration,
      currentUrl: new URL(req.url),
      expectedState: state,
      expectedNonce: flow.nonce,
      codeVerifier: flow.codeVerifier,
    })
  } catch {
    // Signature/iss/aud/exp/nonce/PKCE/state failure — generic reject, nothing leaked.
    // Deliberately swallow the error (no logging) so no token/claim/secret can surface.
    return fail(req, 'invalid')
  }

  // Resolve / link / JIT-provision, with the §7j disabledAt gate applied in every path.
  const resolved = await resolveOidcUser(claims)
  if (!resolved.ok) {
    // Disabled account or unverified-email link attempt → generic reject, no session.
    return fail(req, 'denied')
  }

  // Full session — the IdP performed the auth, so OIDC users get a full session
  // directly (MFA enforcement for OIDC is the IdP's job, by design).
  await createSession(resolved.userId)

  await logAuditRequest('login', req, {
    actorId: resolved.userId,
    targetType: 'user',
    targetId: resolved.userId,
    meta: { method: 'oidc', issuer: claims.iss, outcome: resolved.outcome },
  })

  // #1: landing redirect on the PUBLIC host (not the internal request origin).
  return NextResponse.redirect(new URL(safeRedirectTo(flow.redirectTo), env.publicUrl))
}
