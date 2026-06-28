import 'server-only'
// G2 OIDC provider config (store + read). Single-workspace config persisted in the
// Phase-0 app_config table under key 'oidc' via @/lib/config/repo (which encrypts the
// whole JSON value at rest via secret-box). The client secret is ADDITIONALLY wrapped
// with encryptSecret BEFORE it enters the JSON object, so:
//   • getOidcConfigForDisplay() can return the config with the secret REDACTED to the
//     mask without ever decrypting it (never echoes the secret to the UI/client);
//   • getOidcConfig() decrypts clientSecretEnc ONLY when actually running a flow.
//
// THREAT MODEL (at-rest): the encrypted OIDC client secret is protected against a
// DB-only dump. An attacker who controls the running app's env also holds
// PARCHMENT_SECRET_KEY — that threat is out of scope for at-rest encryption. The key
// lives only in env, never in the DB. The Phase-0 secret-box module carries the full
// threat-model prose; this module references it.
import { getAppConfigJson, setAppConfigJson } from '@/lib/config/repo'
import { decryptSecret, encryptSecret, redactSecret } from '@/lib/crypto/secret-box'

// What is persisted (encrypted) under app_config key 'oidc'. clientSecretEnc is the
// secret-box envelope of the client secret — never the plaintext.
export type StoredOidcConfig = {
  enabled: boolean
  issuerUrl: string
  clientId: string
  clientSecretEnc: string | null
  scopes: string // space-separated; default 'openid email profile'
}

// The decrypted, flow-ready config (client secret in plaintext). Returned ONLY to the
// flow code (start/callback), NEVER to the client.
export type OidcConfig = {
  enabled: boolean
  issuerUrl: string
  clientId: string
  clientSecret: string
  scopes: string
}

// The display config: identical minus the secret, which is the mask when set. Safe to
// pass to the admin UI — the secret is write-only in the form.
export type OidcConfigForDisplay = {
  enabled: boolean
  issuerUrl: string
  clientId: string
  hasSecret: boolean
  secretMask: string | null
  scopes: string
}

export const DEFAULT_OIDC_SCOPES = 'openid email profile'
const OIDC_KEY = 'oidc'

// Raw read of the stored config (secret still encrypted). null when unconfigured.
async function getStored(): Promise<StoredOidcConfig | null> {
  return getAppConfigJson<StoredOidcConfig>(OIDC_KEY)
}

// Persist the config. `clientSecret`:
//   • a non-empty, non-mask string → re-encrypt and store as clientSecretEnc;
//   • undefined or the mask → keep the existing clientSecretEnc (user didn't change it);
//   • the empty string → clear the stored secret.
export async function saveOidcConfig(input: {
  enabled: boolean
  issuerUrl: string
  clientId: string
  clientSecret: string | undefined
  scopes?: string
}): Promise<void> {
  const existing = await getStored()
  let clientSecretEnc: string | null = existing?.clientSecretEnc ?? null

  const incoming = input.clientSecret
  const { SECRET_MASK } = await import('@/lib/crypto/secret-box')
  if (incoming === undefined || incoming === SECRET_MASK) {
    // unchanged — keep existing
  } else if (incoming === '') {
    clientSecretEnc = null
  } else {
    clientSecretEnc = encryptSecret(incoming)
  }

  const stored: StoredOidcConfig = {
    enabled: input.enabled,
    issuerUrl: input.issuerUrl.trim(),
    clientId: input.clientId.trim(),
    clientSecretEnc,
    scopes: (input.scopes ?? existing?.scopes ?? DEFAULT_OIDC_SCOPES).trim() || DEFAULT_OIDC_SCOPES,
  }
  await setAppConfigJson(OIDC_KEY, stored)
}

// Flow-ready config: decrypts clientSecretEnc to plaintext. Returns null when
// unconfigured. Used ONLY by the start/callback flow — never for display.
export async function getOidcConfig(): Promise<OidcConfig | null> {
  const stored = await getStored()
  if (!stored) return null
  let clientSecret = ''
  if (stored.clientSecretEnc) {
    try {
      clientSecret = decryptSecret(stored.clientSecretEnc)
    } catch {
      // A corrupt/foreign secret envelope → treat as no secret (fail-closed). The
      // flow code requires a non-empty secret, so this disables OIDC rather than
      // sending an empty secret to the IdP.
      clientSecret = ''
    }
  }
  return {
    enabled: stored.enabled,
    issuerUrl: stored.issuerUrl,
    clientId: stored.clientId,
    clientSecret,
    scopes: stored.scopes || DEFAULT_OIDC_SCOPES,
  }
}

// Display config: the secret is replaced by the mask (via redactSecret) and NEVER
// decrypted. Safe for the admin UI + the login page's ssoEnabled probe.
export async function getOidcConfigForDisplay(): Promise<OidcConfigForDisplay> {
  const stored = await getStored()
  if (!stored) {
    return {
      enabled: false,
      issuerUrl: '',
      clientId: '',
      hasSecret: false,
      secretMask: null,
      scopes: DEFAULT_OIDC_SCOPES,
    }
  }
  return {
    enabled: stored.enabled,
    issuerUrl: stored.issuerUrl,
    clientId: stored.clientId,
    hasSecret: stored.clientSecretEnc !== null,
    // redactSecret always returns the mask — the real secret can never leak here.
    secretMask: stored.clientSecretEnc ? redactSecret(stored.clientSecretEnc) : null,
    scopes: stored.scopes || DEFAULT_OIDC_SCOPES,
  }
}

// True iff OIDC is configured AND enabled AND has the minimum fields to run a flow.
export async function isOidcEnabled(): Promise<boolean> {
  const stored = await getStored()
  return Boolean(stored?.enabled && stored.issuerUrl && stored.clientId && stored.clientSecretEnc)
}
