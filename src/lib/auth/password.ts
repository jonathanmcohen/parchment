import 'server-only'
import { hash, verify } from '@node-rs/argon2'

// argon2id parameters — OWASP-recommended baseline for interactive logins.
// Tuned to stay well under a login-request budget on commodity hardware while
// remaining costly to brute-force. Encoded into the stored hash string, so a
// later parameter bump verifies old hashes transparently.
const options = {
  // algorithm 2 = argon2id
  algorithm: 2,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, options)
}

export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext)
  } catch {
    // Malformed/legacy hash — treat as a non-match rather than throwing.
    return false
  }
}
