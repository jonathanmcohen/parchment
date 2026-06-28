import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { SessionUser } from '@/lib/auth/session'
import { getUserByToken } from '@/lib/auth/session'
import { getDocAccess } from '@/lib/authz/doc-access'
import { verifyCollabToken } from '@/lib/collab/token'
import { resolveShareGrant } from '@/lib/docs/share-grant'
import { resolveShare } from '@/lib/docs/shares-repo'

// ── H Task 15 (§7h) — the collab onAuthenticate decision ───────────────────
//
// Returns true ONLY when the bearer is allowed to EDIT `documentName`. A collab WS
// connection is an EDIT connection (it can mutate the Y.Doc), so view-only / expired
// grants are rejected. This is the single security boundary for the collab port —
// onAuthenticate calls it, and the port is bound to 127.0.0.1 (never published).
//
// The `token` can be (tried in order):
//   1) a minted collab token  → verify HMAC + exp, then check the user has canEdit
//      on the token's docId AND that docId === documentName (cross-doc IDOR guard).
//   2) a share token          → resolveShareGrant + require the share's docId ===
//      documentName AND the grant maps to canEdit (so a view/expired link is out).
//   3) a session/PAT token    → getUserByToken, then require canEdit on documentName.
//
// No 'server-only' guard: the collab server (bare tsx) imports this via a relative
// path. It pulls in @/db transitively, which loads fine under tsx.

export async function authorizeCollab(
  token: string | undefined | null,
  documentName: string,
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false
  if (!documentName) return false

  // 1) Minted collab token (the common path for authenticated editors).
  const minted = verifyCollabToken(token)
  if (minted) {
    // Cross-doc IDOR: the token must be for the doc being opened.
    if (minted.docId !== documentName) return false
    const user = await resolveUser(minted.userId)
    if (!user) return false
    const access = await getDocAccess({ user }, documentName)
    return access.canEdit
  }

  // 2) Share token (an `edit`/`suggest` link visitor co-editing). resolveShare proves
  // the token is a real, non-expired share; its docId must match the connection's
  // documentName, and the grant must map to canEdit.
  const share = await resolveShare(token)
  if (share) {
    if (share.docId !== documentName) return false
    const grant = await resolveShareGrant(token, null)
    if (!grant) return false
    const access = await getDocAccess({ shareGrant: grant }, documentName)
    return access.canEdit
  }

  // 3) Session cookie value or PAT (Bearer-style) — getUserByToken handles both a
  // session token and a `pat_…` token and rejects disabled users.
  const sessionUser = await getUserByToken(token)
  if (sessionUser) {
    const access = await getDocAccess({ user: sessionUser }, documentName)
    return access.canEdit
  }

  return false
}

// Resolve a userId → the full user row (the SessionUser shape getDocAccess needs),
// honouring the disabled flag. The minted token already proved the identity, so a
// direct users lookup (no session) is correct and cheap.
async function resolveUser(userId: string): Promise<SessionUser | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!u) return null
  if (u.disabledAt !== null) return null // a disabled user can never edit
  return u
}
