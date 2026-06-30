// v0.2.4 #3b: human-readable messages for SSO sign-in failures surfaced on /login.
//
// The SSO start/callback routes redirect to `/login?sso=<code>[&reason=<reason>]`
// on failure (see src/app/api/auth/sso/callback/route.ts and .../start/route.ts).
// Today those codes were opaque ("denied") — an admin could not tell a disabled
// account from an unverified-email-link block. This maps the fixed, non-sensitive
// code/reason enum to an actionable message. It is a PURE function (no DB, no
// React), so it is unit-testable in isolation and reused by the server component.
//
// codes emitted by the routes:
//   sso=unavailable  → OIDC not configured/enabled
//   sso=invalid      → bad/expired/replayed state, or token validation failed
//   sso=error        → discovery/build failure at /start
//   sso=denied       → resolveOidcUser refused; reason ∈ {disabled,
//                      no_verified_email_for_link}

export function ssoErrorMessage(code: string | null, reason?: string | null): string | null {
  if (!code) return null
  switch (code) {
    case 'denied':
      if (reason === 'disabled') {
        return 'Your account is disabled. Contact an administrator to re-enable it.'
      }
      if (reason === 'no_verified_email_for_link') {
        return (
          'Your identity provider did not assert a verified email, so it could not be ' +
          'linked to your existing account. Ask your administrator to enable the ' +
          '“email_verified” claim at the identity provider, or to link your account manually.'
        )
      }
      return 'Single sign-on was refused. Contact an administrator.'
    case 'unavailable':
      return 'Single sign-on is not available. Contact an administrator.'
    case 'error':
      return 'Single sign-on could not start. Try again, or contact an administrator.'
    default:
      // 'invalid' and any unknown code: a generic, non-leaky message.
      return 'Single sign-on did not complete. Please try again.'
  }
}
