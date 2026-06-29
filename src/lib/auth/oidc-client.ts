import 'server-only'
// Thin wrapper around `openid-client` (v6 functional API) for G2 SSO. Isolates the
// library so the route handlers stay small and the security-critical checks live in
// one place. All callers run on the node runtime (openid-client uses node:crypto).
import * as client from 'openid-client'
import type { OidcConfig } from '@/lib/auth/oidc-config'
import { env } from '@/lib/env'

// The fixed redirect_uri — sourced from PARCHMENT_PUBLIC_URL (server config), NEVER
// from request headers (Host/Origin/X-Forwarded-Host). Same anti-spoof rule the
// WebAuthn RP origin follows: a hostile proxy must not be able to redirect the
// authorization code to an attacker-controlled host.
export function oidcRedirectUri(): string {
  return `${env.publicUrl}/api/auth/sso/callback`
}

// #9: the RP-initiated-logout landing. Sent to the IdP as `post_logout_redirect_uri`
// on the end_session redirect, and surfaced in the SSO config UI so the operator can
// register it at the IdP (many providers require an exact-match allow-list). Sourced
// from PARCHMENT_PUBLIC_URL for the same anti-spoof reason as oidcRedirectUri().
export function oidcPostLogoutRedirectUri(): string {
  return `${env.publicUrl}/login`
}

// Only the loopback stub IdP (http on 127.0.0.1/localhost, used by the integration
// tests) is allowed to run over insecure HTTP. A real https issuer never enables it,
// so production TLS verification is never weakened.
function isLoopbackHttp(issuerUrl: string): boolean {
  try {
    const u = new URL(issuerUrl)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  } catch {
    return false
  }
}

// Run OIDC discovery and return a configured client.Configuration. Throws on a bad
// issuer (the caller surfaces a clear "discovery failed" error — "test before save").
export async function discoverOidc(config: OidcConfig): Promise<client.Configuration> {
  const execute = isLoopbackHttp(config.issuerUrl) ? [client.allowInsecureRequests] : undefined
  return client.discovery(
    new URL(config.issuerUrl),
    config.clientId,
    config.clientSecret,
    undefined,
    execute ? { execute } : undefined,
  )
}

export type StartParams = {
  state: string
  nonce: string
  codeVerifier: string
  authorizationUrl: string
}

// Generate PKCE + state + nonce and build the IdP authorization URL with the FIXED
// redirect_uri. The verifier/nonce/state are returned to the caller to persist
// server-side (oidc_login_flows) — the client only ever sees `state` in the URL.
export async function buildStart(
  configuration: client.Configuration,
  scopes: string,
): Promise<StartParams> {
  const codeVerifier = client.randomPKCECodeVerifier()
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
  const state = client.randomState()
  const nonce = client.randomNonce()

  const url = client.buildAuthorizationUrl(configuration, {
    redirect_uri: oidcRedirectUri(),
    scope: scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  })

  return { state, nonce, codeVerifier, authorizationUrl: url.href }
}

export type OidcClaims = {
  iss: string
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
}

// Exchange the authorization code for tokens and VALIDATE them. openid-client checks:
// state match, PKCE verifier↔challenge, the ID-token signature (against the IdP JWKS),
// iss, aud (== our clientId), exp, and the nonce claim == the stored nonce. Any
// failure throws — the caller rejects with a generic error and never creates a
// session. Returns the validated ID-token claims.
export async function exchangeCallback(args: {
  configuration: client.Configuration
  currentUrl: URL
  expectedState: string
  expectedNonce: string
  codeVerifier: string
}): Promise<OidcClaims> {
  const tokens = await client.authorizationCodeGrant(args.configuration, args.currentUrl, {
    expectedState: args.expectedState,
    expectedNonce: args.expectedNonce,
    pkceCodeVerifier: args.codeVerifier,
    idTokenExpected: true,
  })
  const claims = tokens.claims()
  if (!claims) throw new Error('oidc: no id_token in response')
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new Error('oidc: missing sub claim')
  }
  // Build conditionally so optional fields are OMITTED (not set to undefined) under
  // exactOptionalPropertyTypes.
  const out: OidcClaims = { iss: String(claims.iss), sub: claims.sub }
  if (typeof claims.email === 'string') out.email = claims.email
  if (typeof claims.email_verified === 'boolean') out.email_verified = claims.email_verified
  if (typeof claims.name === 'string') out.name = claims.name
  if (typeof claims.preferred_username === 'string')
    out.preferred_username = claims.preferred_username
  return out
}
