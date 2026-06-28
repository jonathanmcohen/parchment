// A4: the SINGLE authority on "may this user perform this action on this doc".
// Two layers:
//   1) canAccessDoc — a PURE function (unit-tested) given the user, the doc's
//      ownerId, the action, and the user's document_permissions row (or null).
//   2) resolveDocAccess / authorizeDocRoute — async wrappers that fetch the doc +
//      the permission row and apply (1). Used by every server route/action that
//      touches a doc. They NEVER leak existence: a denied access is indistinguish-
//      able from a missing doc (both → null / 404).
//
// This is access control. Read the whole file before changing it.
import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { isAdmin } from '@/lib/auth/roles'
import type { SessionUser } from '@/lib/auth/session'

export type DocAction = 'view' | 'comment' | 'edit' | 'manage'
export type DocPermRole = 'viewer' | 'commenter' | 'editor'

export type Doc = typeof schema.documents.$inferSelect

// Canonical ShareGrant shape (reconciliation §1c — locked): a share-token grant is
// just a doc-permission role. H's resolveShareGrant returns { role } and J passes
// { role }; there is NO { share, capabilities } shape anywhere.
export type ShareGrant = { role: DocPermRole }

// The set of actions each doc-permission role unlocks (in addition to the always-
// implied lower ones). 'manage' (share/delete/rename) is intentionally reserved
// for the doc owner and workspace admins — an 'editor' grant can edit content but
// cannot re-share or delete someone else's doc.
const PERM_ALLOWS: Record<DocPermRole, ReadonlySet<DocAction>> = {
  viewer: new Set<DocAction>(['view']),
  commenter: new Set<DocAction>(['view', 'comment']),
  editor: new Set<DocAction>(['view', 'comment', 'edit']),
}

export function canAccessDoc(
  user: { id: string; role: string },
  doc: { ownerId: string },
  action: DocAction,
  perm: { role: DocPermRole } | null,
): boolean {
  // 1) The doc owner has full control.
  if (doc.ownerId === user.id) return true
  // 2) Workspace owner/admin get oversight over every doc (manage included).
  if (isAdmin(user)) return true
  // 3) Otherwise the explicit document_permissions grant decides. No row = no access.
  if (!perm) return false
  return PERM_ALLOWS[perm.role].has(action)
}

// Fetch the doc + the caller's permission row, then decide. Returns the doc when
// allowed, else null. A missing doc and a denied doc both return null.
export async function resolveDocAccess(
  user: SessionUser,
  docId: string,
  action: DocAction,
): Promise<Doc | null> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, docId))
    .limit(1)
  if (!doc) return null

  // Owner / admin short-circuit avoids the perm lookup entirely.
  if (doc.ownerId === user.id || isAdmin(user)) {
    return canAccessDoc(user, doc, action, null) ? doc : null
  }

  const [perm] = await db
    .select({ role: schema.documentPermissions.role })
    .from(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, user.id),
      ),
    )
    .limit(1)

  const permRow = perm ? { role: perm.role as DocPermRole } : null
  return canAccessDoc(user, doc, action, permRow) ? doc : null
}

// Route helper. 401 when unauthenticated; 404 when the doc is missing OR access is
// denied (no existence oracle). On success returns the resolved doc.
export async function authorizeDocRoute(
  user: SessionUser | null,
  docId: string,
  action: DocAction,
): Promise<{ ok: true; doc: Doc } | { ok: false; status: 401 | 404 }> {
  if (!user) return { ok: false, status: 401 }
  const doc = await resolveDocAccess(user, docId, action)
  if (!doc) return { ok: false, status: 404 }
  return { ok: true, doc }
}

// Capability-set: H imports this to check all four capabilities in one call,
// folding together the session user AND an optional share-token grant.
// At least one of user/shareGrant must be non-null.
// H MUST import this from '@/lib/authz/doc-access' — never create a fork.
export async function getDocAccess(
  principals: { user?: SessionUser | null; shareGrant?: ShareGrant | null },
  docId: string,
): Promise<{ canView: boolean; canComment: boolean; canEdit: boolean; canManage: boolean }> {
  const { user, shareGrant } = principals
  const deny = { canView: false, canComment: false, canEdit: false, canManage: false }

  // Fetch doc once
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, docId))
    .limit(1)
  if (!doc) return deny

  // Compute best permission row from session user (if present)
  let bestPerm: { role: DocPermRole } | null = shareGrant ?? null
  if (user) {
    // owner / admin short-circuit: full access
    if (doc.ownerId === user.id || isAdmin(user)) {
      return { canView: true, canComment: true, canEdit: true, canManage: true }
    }
    // look up explicit document_permissions row
    const [row] = await db
      .select({ role: schema.documentPermissions.role })
      .from(schema.documentPermissions)
      .where(
        and(
          eq(schema.documentPermissions.docId, docId),
          eq(schema.documentPermissions.userId, user.id),
        ),
      )
      .limit(1)
    if (row) {
      // take the more permissive of session perm vs share grant
      const sessionPerm = { role: row.role as DocPermRole }
      bestPerm =
        bestPerm && PERM_ALLOWS[bestPerm.role].size >= PERM_ALLOWS[sessionPerm.role].size
          ? bestPerm
          : sessionPerm
    }
  }

  if (!bestPerm) return deny
  const allowed = PERM_ALLOWS[bestPerm.role]
  return {
    canView: allowed.has('view'),
    canComment: allowed.has('comment'),
    canEdit: allowed.has('edit'),
    canManage: false, // share-grant or doc-perm never grants manage; only owner/admin does
  }
}
