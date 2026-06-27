// Canonical ENCRYPTED config repo — Phase 0 §1b.
// The ONLY module that reads/writes the app_config table.
// B, backup-sync, and G import from here. No other module accesses app_config directly.
//
// Each value is encrypted at rest via src/lib/crypto/secret-box.ts.
// If PARCHMENT_SECRET_KEY is absent, setAppConfig/setAppConfigJson throw (the 503 path
// — a write without a key would otherwise crash deeper in crypto).
// getAppConfig/getAppConfigJson return null on a missing row OR a decrypt failure
// (a corrupt/foreign envelope is treated as "missing" so a bad row can't take a read down).
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { DecryptError, decryptSecret, encryptSecret } from '@/lib/crypto/secret-box'

/** Encrypt `plaintext` and upsert it under `key`. Throws if PARCHMENT_SECRET_KEY is absent. */
export async function setAppConfig(key: string, plaintext: string): Promise<void> {
  const value = encryptSecret(plaintext)
  await db
    .insert(schema.appConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appConfig.key,
      set: { value, updatedAt: new Date() },
    })
}

/**
 * Read + decrypt the value for `key`. Returns null if the row is missing, or if the
 * stored envelope fails to decrypt (DecryptError — corrupt/foreign/wrong-key value).
 * Any non-decrypt error (e.g. a DB connectivity failure) is rethrown.
 */
export async function getAppConfig(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.appConfig.value })
    .from(schema.appConfig)
    .where(eq(schema.appConfig.key, key))
    .limit(1)
  if (row === undefined) return null
  try {
    return decryptSecret(row.value)
  } catch (err) {
    if (err instanceof DecryptError) {
      // Never log the value/key material — just the key NAME and the failure kind.
      console.error('app_config decrypt failed; treating as missing', { key, name: err.name })
      return null
    }
    throw err
  }
}

/** Delete the row for `key` (no-op if absent). */
export async function deleteAppConfig(key: string): Promise<void> {
  await db.delete(schema.appConfig).where(eq(schema.appConfig.key, key))
}

/** JSON-serialise `obj`, then encrypt + upsert under `key`. Throws if the key is absent. */
export async function setAppConfigJson(key: string, obj: unknown): Promise<void> {
  await setAppConfig(key, JSON.stringify(obj))
}

/**
 * Read + decrypt + JSON.parse the value for `key`. Returns null if the row is missing,
 * decryption fails, or the decrypted text is not valid JSON (SyntaxError) — never throws
 * on a corrupt value.
 */
export async function getAppConfigJson<T>(key: string): Promise<T | null> {
  const plaintext = await getAppConfig(key)
  if (plaintext === null) return null
  try {
    return JSON.parse(plaintext) as T
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('app_config JSON parse failed; treating as missing', { key, name: err.name })
      return null
    }
    throw err
  }
}
