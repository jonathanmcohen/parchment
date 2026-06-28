'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { logAudit } from '@/lib/audit'
import { ownerExists } from '@/lib/auth/bootstrap'
import { hashPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { seedGuideWorkspace } from '@/lib/docs/seed-guide'
import { env } from '@/lib/env'

export type SetupState = { error: string } | null

function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

// First-run owner creation. Guarded against a race: if an owner appears between
// the page check and submit, we bail to /login rather than create a second user.
export async function createOwner(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (await ownerExists()) redirect('/login')

  const name = field(formData, 'name')
  const email = field(formData, 'email').toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!name) return { error: 'Name is required.' }
  if (!email?.includes('@')) return { error: 'A valid email is required.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const passwordHash = await hashPassword(password)

  const [user] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      passwordHash,
      role: 'owner', // §7d: owner role MUST NOT be downgraded; only quotaMb is added here
      quotaMb: env.defaultQuotaMb,
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id })

  if (!user) {
    // Email already taken — the owner (or a prior attempt) exists.
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
    if (existing) redirect('/login')
    return { error: 'Could not create the owner account.' }
  }

  // §7b: emit via the hash-chained logAudit (NOT a raw db.insert with a NULL
  // entry_hash) so this first-boot row joins the chain and verifyAuditChain stays
  // ok. First-boot has no request scope, so ip is omitted (null). logAudit never
  // throws — owner creation must not be blocked by an audit write.
  await logAudit('setup', { actorId: user.id, targetType: 'user', targetId: user.id })

  await createSession(user.id)

  // L6: seed the first-run "Parchment Guide" so a fresh install isn't empty.
  // Wrapped: a seed failure must NEVER block owner creation. Runs before the
  // redirect (which throws Next's control-flow signal) so it isn't skipped, and
  // the catch is narrow to the seed so it can't swallow that signal.
  try {
    await seedGuideWorkspace(user.id)
  } catch {
    // ignore — the guide is a nicety; owner creation already succeeded.
  }

  // I4: after account creation, redirect to the setup config wizard step.
  // The wizard shows DB status, SMTP config, and S3 checklist — informational only.
  redirect('/setup/config')
}
