// AES-256-GCM secret envelope helper — Phase 0 canonical crypto module.
// ALL other modules that need to encrypt/decrypt instance secrets import from here.
// NO other crypto module for this purpose is created anywhere in the codebase.
//
// Envelope format: 'v1:<base64 12-byte IV>:<base64 ciphertext>:<base64 16-byte GCM tag>'
// Master key:      PARCHMENT_SECRET_KEY (base64-encoded 32 bytes), validated in env.ts.
//
// Key loading: resolves `process.env.PARCHMENT_SECRET_KEY` at call time (not module
// load time) so the module can be imported even when the key is absent (secret WRITES
// return 503 at the route level; reads of unencrypted config still work).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** The exact 8 bullet characters (U+2022) used to mask a secret in any UI/API surface. */
export const SECRET_MASK = '••••••••'

/** Thrown by decryptSecret on a malformed envelope, wrong key, or tampered ciphertext/tag. */
export class DecryptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecryptError'
  }
}

/** True iff the value is exactly the mask placeholder (i.e. the caller never sent a real secret). */
export function isMasked(v: string): boolean {
  return v === SECRET_MASK
}

/**
 * Returns SECRET_MASK. Always — the caller decides WHEN to redact; this guarantees
 * the real value can never leak through this function. Use it on every log/error path
 * that might otherwise touch a plaintext secret or the master key.
 */
export function redactSecret(_v: string): string {
  return SECRET_MASK
}

// Resolve + validate the master key at CALL time. Returns a 32-byte Buffer.
// Throws a clear error (never a raw crypto crash) if the key is absent or malformed.
// Error messages NEVER interpolate key material.
function loadKey(): Buffer {
  const raw = process.env.PARCHMENT_SECRET_KEY
  if (!raw) throw new Error('PARCHMENT_SECRET_KEY is not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    // Length only — never echo the (possibly secret) raw value.
    throw new Error('PARCHMENT_SECRET_KEY must decode to exactly 32 bytes')
  }
  return buf
}

/**
 * Encrypt `plain` with AES-256-GCM under PARCHMENT_SECRET_KEY.
 * Returns the versioned envelope `v1:<b64 iv>:<b64 ct>:<b64 tag>`.
 * The 12-byte IV is freshly random per call (never reused, never derived).
 * Throws Error('PARCHMENT_SECRET_KEY is not set') if the key is absent.
 */
export function encryptSecret(plain: string): string {
  const key = loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`
}

/**
 * Decrypt an envelope produced by encryptSecret. Fails CLOSED: any tamper (ciphertext
 * or tag bit-flip), wrong key, malformed structure, or unknown version raises DecryptError
 * — no partial plaintext is ever returned. Error messages NEVER contain the plaintext,
 * the ciphertext, or the key.
 */
export function decryptSecret(envelope: string): string {
  const parts = envelope.split(':')
  if (parts.length !== 4) throw new DecryptError('malformed envelope')
  const [version, ivB64, ctB64, tagB64] = parts as [string, string, string, string]
  if (version !== 'v1') throw new DecryptError('unsupported envelope version')

  let key: Buffer
  try {
    key = loadKey()
  } catch (err) {
    // Surface the missing/malformed-key condition as a DecryptError without key material.
    throw new DecryptError(err instanceof Error ? err.message : 'PARCHMENT_SECRET_KEY is not set')
  }

  try {
    const iv = Buffer.from(ivB64, 'base64')
    const ct = Buffer.from(ctB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch {
    // Includes ERR_CRYPTO_INVALID_AUTH_TAG (tamper / wrong key) and any IV/length error.
    // Deliberately swallow the underlying error so no ciphertext/key bytes leak.
    throw new DecryptError('decryption failed')
  }
}
