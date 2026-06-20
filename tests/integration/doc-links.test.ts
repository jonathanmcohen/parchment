import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// F6: doc_links repo — setDocLinks + backlinks against real Postgres
// (Testcontainers). Covers link creation/replacement, removal, owner-scoping,
// and FK cascade on doc delete.

let container: StartedPostgreSqlContainer
let ownerId: string
let otherOwnerId: string
const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()

  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }

  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('links@p.local','Link User','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  const otherRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('other@p.local','Other User','owner') RETURNING id",
  )
  otherOwnerId = otherRes.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('F6 — doc_links repo', () => {
  it('A links B → backlinks(B) returns A', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'Source A' })
    const { id: b } = await createDocument(ownerId, { title: 'Target B' })

    await setDocLinks(a, [b])

    const links = await backlinks(b, ownerId)
    expect(links.map((l) => l.id)).toContain(a)
    const found = links.find((l) => l.id === a)
    expect(found?.title).toBe('Source A')
  })

  it('removing the link updates backlinks (setDocLinks replaces the row set)', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'RemSource' })
    const { id: b } = await createDocument(ownerId, { title: 'RemTarget' })

    await setDocLinks(a, [b])
    expect((await backlinks(b, ownerId)).map((l) => l.id)).toContain(a)

    // Re-save A with NO links → its row to B is gone.
    await setDocLinks(a, [])
    expect((await backlinks(b, ownerId)).map((l) => l.id)).not.toContain(a)
  })

  it('setDocLinks replaces, not appends (old targets dropped, new kept)', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'ReplSource' })
    const { id: b1 } = await createDocument(ownerId, { title: 'ReplTarget1' })
    const { id: b2 } = await createDocument(ownerId, { title: 'ReplTarget2' })

    await setDocLinks(a, [b1])
    await setDocLinks(a, [b2])

    expect((await backlinks(b1, ownerId)).map((l) => l.id)).not.toContain(a)
    expect((await backlinks(b2, ownerId)).map((l) => l.id)).toContain(a)
  })

  it('dedupes + ignores self-links + skips non-existent targets (best-effort)', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'DedupeSource' })
    const { id: b } = await createDocument(ownerId, { title: 'DedupeTarget' })
    const ghost = '00000000-0000-0000-0000-0000000000ff'

    // Duplicate b, a self-link to a, and a ghost id that does not exist.
    await expect(setDocLinks(a, [b, b, a, ghost])).resolves.toBeUndefined()

    const links = await backlinks(b, ownerId)
    expect(links.filter((l) => l.id === a)).toHaveLength(1)
    // The self-link did not produce a backlink from a to itself.
    expect((await backlinks(a, ownerId)).map((l) => l.id)).not.toContain(a)
  })

  it('backlinks is owner-scoped: another owner sees no backlinks for the target', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'ScopeSource' })
    const { id: b } = await createDocument(ownerId, { title: 'ScopeTarget' })
    await setDocLinks(a, [b])

    // The other owner does not own the SOURCE doc, so the join filters it out.
    expect(await backlinks(b, otherOwnerId)).toEqual([])
  })

  it('FK cascade: deleting the source doc removes its doc_links rows', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks, backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'CascadeSource' })
    const { id: b } = await createDocument(ownerId, { title: 'CascadeTarget' })
    await setDocLinks(a, [b])
    expect((await backlinks(b, ownerId)).map((l) => l.id)).toContain(a)

    // Hard-delete the source doc → the doc_links row cascades away.
    await db.delete(schema.documents).where(eq(schema.documents.id, a))
    expect((await backlinks(b, ownerId)).map((l) => l.id)).not.toContain(a)
  })

  it('FK cascade: deleting the TARGET doc removes its doc_links rows', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { createDocument } = await import('@/lib/docs/repo')
    const { setDocLinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'CascadeTargetSrc' })
    const { id: b } = await createDocument(ownerId, { title: 'CascadeTargetDst' })
    await setDocLinks(a, [b])

    const before = await db
      .select({ s: schema.docLinks.sourceDocId })
      .from(schema.docLinks)
      .where(eq(schema.docLinks.sourceDocId, a))
    expect(before.length).toBe(1)

    await db.delete(schema.documents).where(eq(schema.documents.id, b))

    const after = await db
      .select({ s: schema.docLinks.sourceDocId })
      .from(schema.docLinks)
      .where(eq(schema.docLinks.sourceDocId, a))
    expect(after.length).toBe(0)
  })

  it('saveDocument extracts wikiLink targets into doc_links (end-to-end best-effort)', async () => {
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')
    const { backlinks } = await import('@/lib/docs/doc-links-repo')

    const { id: a } = await createDocument(ownerId, { title: 'SaveSource' })
    const { id: b } = await createDocument(ownerId, { title: 'SaveTarget' })

    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'links to ' },
            { type: 'wikiLink', attrs: { targetId: b, label: 'SaveTarget' } },
          ],
        },
      ],
    }
    await saveDocument(a, {
      contentJson,
      markdown: 'links to [[SaveTarget]]\n',
      title: 'SaveSource',
    })

    expect((await backlinks(b, ownerId)).map((l) => l.id)).toContain(a)
  })
})
