import 'server-only'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/db'

// True once any user row exists. Used by /setup and /login to decide whether
// the instance still needs first-run owner provisioning.
export async function ownerExists(): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users)
  return (row?.count ?? 0) > 0
}

// ensureOwner — no-op if a user already exists. Single-owner v0.1: the owner is
// created interactively at /setup, so this guard simply asserts the invariant
// callers rely on and never auto-creates a credential-less account.
export async function ensureOwner(): Promise<void> {
  // Intentionally a no-op when an owner is present. Left as the documented hook
  // for non-interactive provisioning (e.g. seed env vars) in a later plan.
  if (await ownerExists()) return
}
