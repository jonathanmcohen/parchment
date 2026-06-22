import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getDocument } from '@/lib/docs/repo'

// G2: user-saved templates. Owner-scoped CRUD over the `templates` table. The
// bundled gallery lives in builtin-templates.ts (pure data); this module is the
// DB side. No 'server-only' guard so it stays unit/integration-testable; it
// touches `db` and is only imported by server routes/components in app code.

export type Template = typeof schema.templates.$inferSelect

export async function createTemplate(
  ownerId: string,
  opts: { name: string; description?: string; content: unknown },
): Promise<{ id: string }> {
  const name = opts.name.trim()
  if (name.length === 0) throw new Error('empty name')
  const [row] = await db
    .insert(schema.templates)
    .values({
      ownerId,
      name,
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      content: opts.content,
    })
    .returning({ id: schema.templates.id })
  if (!row) throw new Error('createTemplate: insert returned no row')
  return { id: row.id }
}

/** Create a template from an existing doc's content (owner-scoped: the doc must
 *  be the owner's, else throw). The new template's name is the supplied name. */
export async function createTemplateFromDoc(
  ownerId: string,
  docId: string,
  name: string,
): Promise<{ id: string }> {
  const doc = await getDocument(docId)
  if (!doc || doc.ownerId !== ownerId) throw new Error('not found')
  return createTemplate(ownerId, { name, content: doc.content })
}

export async function listTemplates(ownerId: string): Promise<Template[]> {
  return db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.ownerId, ownerId))
    .orderBy(desc(schema.templates.createdAt))
}

export async function deleteTemplate(ownerId: string, id: string): Promise<void> {
  await db
    .delete(schema.templates)
    .where(and(eq(schema.templates.id, id), eq(schema.templates.ownerId, ownerId)))
}

/** Get a user template's content (owner-scoped) for instantiation, or null if
 *  it doesn't exist or isn't owned by `ownerId`. */
export async function getTemplateContent(ownerId: string, id: string): Promise<unknown | null> {
  const [row] = await db
    .select({ content: schema.templates.content })
    .from(schema.templates)
    .where(and(eq(schema.templates.id, id), eq(schema.templates.ownerId, ownerId)))
    .limit(1)
  return row ? row.content : null
}
