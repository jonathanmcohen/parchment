import 'server-only'
// G2 — resolve (and, if needed, link/provision) the workspace user for a validated
// set of OIDC ID-token claims. The security-critical rules:
//   • Identity match keys on (issuer, subject) — the IdP's stable per-user id — NOT
//     email, so an attacker controlling an email at a second IdP can't hijack an
//     account (oidc_identities UNIQUE(issuer,subject)).
//   • Email-link (an existing local account adopting an IdP identity) is GATED on
//     email_verified === true — an unverified IdP email must never link to a local
//     account (account-takeover defense).
//   • JIT-provisioned users get role 'editor' (canonical default; 'member' is banned)
//     and a null passwordHash (SSO-only — no local password).
//   • disabledAt gate (§7j): in ALL THREE paths, after resolving a user row, if
//     disabledAt IS NOT NULL we reject — no session, no lastLoginAt update, no
//     identity-row insert. A disabled user's email can never re-activate via OIDC.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { OidcClaims } from '@/lib/auth/oidc-client'

export type ResolveResult =
  | { ok: true; userId: string; outcome: 'identity' | 'link' | 'jit' }
  | { ok: false; reason: 'disabled' | 'no_verified_email_for_link' }

type UserRow = typeof schema.users.$inferSelect

// Returns true if the user is disabled (cannot get a session via OIDC).
function isDisabled(user: UserRow): boolean {
  return user.disabledAt !== null
}

export async function resolveOidcUser(claims: OidcClaims): Promise<ResolveResult> {
  // 1. Identity match on (issuer, subject).
  const [identity] = await db
    .select({ userId: schema.oidcIdentities.userId })
    .from(schema.oidcIdentities)
    .where(
      and(
        eq(schema.oidcIdentities.issuer, claims.iss),
        eq(schema.oidcIdentities.subject, claims.sub),
      ),
    )
    .limit(1)

  if (identity) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, identity.userId))
      .limit(1)
    // §7j: a disabled user is rejected BEFORE any state change (no lastLoginAt bump).
    if (!user || isDisabled(user)) return { ok: false, reason: 'disabled' }
    await db
      .update(schema.oidcIdentities)
      .set({ lastLoginAt: new Date(), email: claims.email ?? null })
      .where(
        and(
          eq(schema.oidcIdentities.issuer, claims.iss),
          eq(schema.oidcIdentities.subject, claims.sub),
        ),
      )
    return { ok: true, userId: user.id, outcome: 'identity' }
  }

  // 2. Email link — ONLY when the IdP asserts a VERIFIED email and a local user with
  //    that email exists. Gated to prevent takeover via an unverified email.
  const email = claims.email?.trim().toLowerCase()
  if (email && claims.email_verified === true) {
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
    if (existing) {
      // §7j: never link/log-in a disabled account, and do NOT insert an identity row.
      if (isDisabled(existing)) return { ok: false, reason: 'disabled' }
      await db.insert(schema.oidcIdentities).values({
        userId: existing.id,
        issuer: claims.iss,
        subject: claims.sub,
        email: claims.email ?? null,
        lastLoginAt: new Date(),
      })
      return { ok: true, userId: existing.id, outcome: 'link' }
    }
  }

  // If there IS a local user with this email but it is NOT verified, we must NOT link
  // (takeover defense). We also do not silently provision a duplicate over a real
  // account — reject so the local account is never shadowed by an unverified claim.
  if (email && claims.email_verified !== true) {
    const [collision] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
    if (collision) return { ok: false, reason: 'no_verified_email_for_link' }
  }

  // 3. JIT-provision a brand-new user. role 'editor' (canonical; 'member' is banned),
  //    null passwordHash (SSO-only). NOTE: swap to Group A's createUser helper once it
  //    lands — ensure it accepts an explicit role so this 'editor' default is passed
  //    through. A just-provisioned row never has disabledAt set, but the resolve
  //    contract is uniform: a disabled row would be rejected above.
  const provisionEmail = email ?? `${claims.sub}@oidc.local`
  const name = claims.name?.trim() || claims.preferred_username?.trim() || provisionEmail
  const [created] = await db
    .insert(schema.users)
    .values({ email: provisionEmail, name, passwordHash: null, role: 'editor' })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id })

  let userId = created?.id
  if (!userId) {
    // A race created the user between our checks — re-read it (and re-apply the gate).
    const [again] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, provisionEmail))
      .limit(1)
    if (!again || isDisabled(again)) return { ok: false, reason: 'disabled' }
    userId = again.id
  }

  await db.insert(schema.oidcIdentities).values({
    userId,
    issuer: claims.iss,
    subject: claims.sub,
    email: claims.email ?? null,
    lastLoginAt: new Date(),
  })
  return { ok: true, userId, outcome: 'jit' }
}
