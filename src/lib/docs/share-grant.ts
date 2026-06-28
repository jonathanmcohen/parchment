// ── H Task 7 — resolve a request's share grant from a token ────────────────
//
// A share link lets an UNAUTHENTICATED visitor act at its permission level. This
// module maps a share token (+ optional password) to the canonical ShareGrant shape
// A's getDocAccess accepts: `{ role: DocPermRole }` (reconciliation §1c/§7r). It
// does NOT map role→capabilities (A owns that via PERM_ALLOWS); it ONLY derives the
// role from the share row's permission level.
//
// SECURITY: the token travels on share-scoped routes (`/api/share/[token]/...`) so
// the capability is bound to the URL the visitor already holds — never on the
// owner-auth `/api/docs/[id]/...` routes. Expiry + password are enforced here, every
// call, by composing shares-repo (we do NOT re-implement argon2/expiry).

// No 'server-only' guard: this is imported by the share-edit-auth integration suite
// (which calls it directly) and only ever pulled into server routes in app code.
import type { DocPermRole, ShareGrant } from '@/lib/authz/doc-access'
import { type Permission, resolveShare, verifySharePassword } from '@/lib/docs/shares-repo'

export type { ShareGrant }

/**
 * Map a share row's permission level to a doc-permission role.
 *   view → viewer, comment → commenter, edit → editor, suggest → editor.
 * `suggest` is an edit-via-tracked-changes — it gets the `editor` role so
 * getDocAccess grants canEdit; the tracked-changes enforcement is UI-layer only.
 */
export function permissionToRole(permission: Permission): DocPermRole {
  switch (permission) {
    case 'view':
      return 'viewer'
    case 'comment':
      return 'commenter'
    default:
      // 'edit' | 'suggest'
      return 'editor'
  }
}

/**
 * Resolve a share token (+ optional password) to a ShareGrant, or null.
 * Returns null for a missing token, an EXPIRED share (resolveShare drops those), or
 * a wrong/absent password against a protected share. On success returns the
 * canonical `{ role }` shape that A's getDocAccess accepts directly.
 */
export async function resolveShareGrant(
  token: string,
  password: string | null,
): Promise<ShareGrant | null> {
  const share = await resolveShare(token)
  if (!share) return null // missing OR expired
  const ok = await verifySharePassword(share, password)
  if (!ok) return null
  return { role: permissionToRole(share.permission as Permission) }
}
