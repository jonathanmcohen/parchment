import { type NextRequest, NextResponse } from 'next/server'
import { logAuditRequest } from '@/lib/audit'
import { resolveOidcUser } from '@/lib/auth/oidc-account'
import { discoverOidc, exchangeCallback, oidcRedirectUri } from '@/lib/auth/oidc-client'
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

function fail(_req: NextRequest, code: string, reason?: string): NextResponse {
  // #1: redirect to the PUBLIC host, not the internal request origin (0.0.0.0:3000
  // behind a TLS-terminating proxy). The request arg is retained for the signature
  // (callers pass it) but the origin is no longer derived from it.
  // v0.2.4 #3b: an optional `reason` is appended (e.g. ?sso=denied&reason=disabled)
  // so the login page can explain WHY an SSO sign-in was refused. The reason codes
  // are a fixed, non-sensitive enum from resolveOidcUser — no token/claim/email is
  // ever leaked here.
  const url = new URL(`/login?sso=${code}`, env.publicUrl)
  if (reason) url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
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
    // openid-client derives the token request's redirect_uri from currentUrl, and the
    // IdP requires it to byte-match the registered value. Behind the TLS-terminating
    // proxy req.url carries the INTERNAL origin (http://0.0.0.0:3000), so it must be
    // rebuilt on the PUBLIC callback URL (same anti-spoof rule as /start) with the
    // incoming ?code&state&iss query preserved.
    claims = await exchangeCallback({
      configuration,
      currentUrl: new URL(`${oidcRedirectUri()}${req.nextUrl.search}`),
      expectedState: state,
      expectedNonce: flow.nonce,
      codeVerifier: flow.codeVerifier,
    })
  } catch (err) {
    // Signature/iss/aud/exp/nonce/PKCE/state failure — generic reject toward the
    // browser (nothing leaked in the response), but log the error CLASS + message
    // server-side so operators can diagnose (e.g. the IdP's invalid_grant reason).
    // openid-client messages never embed tokens; claims/secrets are never logged.
    const detail =
      err && typeof err === 'object' && 'error_description' in err
        ? ` (${String((err as { error_description: unknown }).error_description)})`
        : ''
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error'
    console.error(`[sso] callback token exchange failed: ${msg}${detail}`)
    return fail(req, 'invalid')
  }

  // Resolve / link / JIT-provision, with the §7j disabledAt gate applied in every path.
  const resolved = await resolveOidcUser(claims)
  if (!resolved.ok) {
    // Disabled account or unverified-email link attempt → reject, no session. Thread
    // the specific reason ('disabled' | 'no_verified_email_for_link') so the login
    // page can show an actionable message instead of an opaque "denied".
    return fail(req, 'denied', resolved.reason)
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
