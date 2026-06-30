import { OidcConfigForm, type OidcFormValues } from '@/components/settings/OidcConfigForm'
import { requireAdmin } from '@/lib/auth/guard'
import { oidcPostLogoutRedirectUri, oidcRedirectUri } from '@/lib/auth/oidc-client'
import { getOidcConfigForDisplay } from '@/lib/auth/oidc-config'
import { SECRET_MASK } from '@/lib/crypto/secret-box'

export const dynamic = 'force-dynamic'

export default async function SsoSettingsPage() {
  // The admin layout already gates this subtree; requireAdmin again is harmless
  // defense-in-depth and gives the page a typed user if it ever needs one.
  await requireAdmin()

  // Display config ONLY — the secret is the mask, never decrypted/echoed.
  const display = await getOidcConfigForDisplay()
  const initial: OidcFormValues = {
    enabled: display.enabled,
    issuerUrl: display.issuerUrl,
    clientId: display.clientId,
    clientSecret: display.hasSecret ? SECRET_MASK : '',
    scopes: display.scopes,
  }

  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Single sign-on (OIDC)</h1>
      <p className="mt-2 text-[var(--muted)]">
        Connect an OpenID Connect identity provider (Google, GitHub, Authentik, Keycloak, …). The
        client secret is encrypted at rest. Saving validates the issuer via discovery.
      </p>

      <div className="mt-8">
        {/* #3/#9: surface the IdP-registration URLs (server-computed from
            PARCHMENT_PUBLIC_URL) so the operator copies the exact values. */}
        <OidcConfigForm
          initial={initial}
          callbackUrl={oidcRedirectUri()}
          postLogoutUrl={oidcPostLogoutRedirectUri()}
        />
      </div>
    </section>
  )
}
