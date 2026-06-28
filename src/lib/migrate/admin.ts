import 'server-only'

// D — instance-migrate DB helpers. The receive endpoint restores into the
// FIRST admin/owner (single-owner v0.2.0; multi-user gets a targetUserId param
// later — documented as a known limitation in the route).

import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/db'

/** The first admin/owner user by creation time, or null if none exists. */
export async function getFirstAdminUser(): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(inArray(schema.users.role, ['owner', 'admin']))
    .orderBy(asc(schema.users.createdAt))
    .limit(1)
  return row ?? null
}

/** Number of (non-trashed) documents owned by `ownerId` — for the dry-run diff. */
export async function countDocuments(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
  return row?.n ?? 0
}
