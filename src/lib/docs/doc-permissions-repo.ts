// A4 ACL store. No 'server-only' guard so it is integration-testable (mirrors
// shares-repo). Only server routes/actions import it. Enrolment of who-may-grant
// is enforced at the route/action layer (manage access); this repo is pure CRUD.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { DocPermRole } from '@/lib/authz/doc-access'

export type DocPermission = typeof schema.documentPermissions.$inferSelect

export async function grantDocPermission(input: {
  docId: string
  userId: string
  role: DocPermRole
  grantedBy: string
}): Promise<void> {
  // Upsert: one role per (doc,user). A repeat grant updates the role in place.
  await db
    .insert(schema.documentPermissions)
    .values({
      docId: input.docId,
      userId: input.userId,
      role: input.role,
      grantedBy: input.grantedBy,
    })
    .onConflictDoUpdate({
      target: [schema.documentPermissions.docId, schema.documentPermissions.userId],
      set: { role: input.role, grantedBy: input.grantedBy },
    })
}

export async function setDocPermission(
  docId: string,
  userId: string,
  role: DocPermRole,
): Promise<void> {
  await db
    .update(schema.documentPermissions)
    .set({ role })
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
}

export async function revokeDocPermission(docId: string, userId: string): Promise<void> {
  await db
    .delete(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
}

export async function getDocPermission(
  docId: string,
  userId: string,
): Promise<DocPermission | null> {
  const [row] = await db
    .select()
    .from(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
    .limit(1)
  return row ?? null
}

// Joined with users so the share UI can show name/email per grant. Never returns
// password/token fields — only id/name/email/role.
export async function listDocPermissions(
  docId: string,
): Promise<Array<{ userId: string; name: string; email: string; role: DocPermRole }>> {
  const rows = await db
    .select({
      userId: schema.documentPermissions.userId,
      role: schema.documentPermissions.role,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.documentPermissions)
    .innerJoin(schema.users, eq(schema.users.id, schema.documentPermissions.userId))
    .where(eq(schema.documentPermissions.docId, docId))
  return rows.map((r) => ({ ...r, role: r.role as DocPermRole }))
}
