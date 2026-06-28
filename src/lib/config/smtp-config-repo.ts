// Typed SMTP config wrapper over the canonical encrypted config repo (Phase 0 §1b).
// All persistence goes through @/lib/config/repo — no direct crypto calls here.
// Password is stored separately under 'smtp_password' and NEVER returned in SmtpConfig.
import {
  deleteAppConfig,
  getAppConfig,
  getAppConfigJson,
  setAppConfig,
  setAppConfigJson,
} from '@/lib/config/repo'
import { isMasked, SECRET_MASK } from '@/lib/crypto/secret-box'

export type SmtpConfig = {
  host: string
  port: number // validated 1-65535 at the API layer
  user: string
  fromAddress: string
  tls: 'none' | 'tls' | 'starttls'
  // password is NEVER in this type — separate read/write path via 'smtp_password' key
}

/**
 * Returns the current non-secret SMTP config, or null when not yet configured.
 * Never contains a password field.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  return getAppConfigJson<SmtpConfig>('smtp_config')
}

/**
 * Returns SECRET_MASK when a password is stored, or null when none is stored.
 * Callers use this to populate the UI password placeholder without ever
 * receiving the plaintext.
 */
export async function getSmtpPasswordMasked(): Promise<string | null> {
  const value = await getAppConfig('smtp_password')
  if (value === null) return null
  return SECRET_MASK
}

/**
 * Persists all SMTP config fields.
 * - The non-secret fields (host/port/user/fromAddress/tls) are stored as an
 *   encrypted JSON blob under 'smtp_config'.
 * - If `password` equals SECRET_MASK, the stored password is left unchanged
 *   (the user did not change it — prevents a second encrypt of the mask string).
 * - If `password` is a non-empty, non-masked string, it is stored encrypted
 *   under 'smtp_password' via repo.ts.
 * - If `password` is an empty string, the stored password key is cleared
 *   (unauthenticated relay / no-auth SMTP).
 */
export async function saveSmtpConfig(config: SmtpConfig & { password: string }): Promise<void> {
  const { password, ...nonSecretFields } = config

  // Always persist the non-secret fields
  await setAppConfigJson('smtp_config', nonSecretFields)

  // Only touch the password key if the caller provided a real change
  if (isMasked(password)) {
    // Leave the stored password unchanged — the user did not re-enter it
    return
  }

  if (password === '') {
    // Clear the password (unauthenticated relay)
    await deleteAppConfig('smtp_password')
  } else {
    // Store the new plaintext; repo.ts encrypts it via secret-box
    await setAppConfig('smtp_password', password)
  }
}

/**
 * True when a complete SMTP config (non-secret fields) exists in the DB.
 * Does not check whether a password is present (some relays need no auth).
 */
export async function isSmtpConfigured(): Promise<boolean> {
  const config = await getAppConfigJson<SmtpConfig>('smtp_config')
  return config !== null
}

/**
 * Removes all SMTP config rows. Used in tests or a future "reset" admin action.
 */
export async function clearSmtpConfig(): Promise<void> {
  await deleteAppConfig('smtp_config')
  await deleteAppConfig('smtp_password')
}
