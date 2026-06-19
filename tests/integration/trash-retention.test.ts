import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E11: trash retention + emptyTrash against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
let owner2Id: string
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

  // Seed two users
  const u1 = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('trash1@p.local','Trash User 1','owner') RETURNING id",
  )
  ownerId = u1.rows[0]?.id ?? ''

  const u2 = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('trash2@p.local','Trash User 2','owner') RETURNING id",
  )
  owner2Id = u2.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('E11 — settings-repo', () => {
  it('getSetting returns fallback when unset', async () => {
    const { getSetting } = await import('@/lib/docs/settings-repo')
    const result = await getSetting(ownerId, 'nonexistent-key', 'default-value')
    expect(result).toBe('default-value')
  })

  it('setSetting then getSetting round-trips', async () => {
    const { getSetting, setSetting } = await import('@/lib/docs/settings-repo')
    await setSetting(ownerId, 'testKey', { nested: 42 })
    const result = await getSetting<{ nested: number }>(ownerId, 'testKey', { nested: 0 })
    expect(result).toEqual({ nested: 42 })
  })

  it('setSetting upserts on conflict', async () => {
    const { getSetting, setSetting } = await import('@/lib/docs/settings-repo')
    await setSetting(ownerId, 'upsertKey', 'first')
    await setSetting(ownerId, 'upsertKey', 'second')
    const result = await getSetting<string>(ownerId, 'upsertKey', '')
    expect(result).toBe('second')
  })

  it('getTrashRetentionDays returns default 30', async () => {
    const { getTrashRetentionDays } = await import('@/lib/docs/settings-repo')
    const days = await getTrashRetentionDays(ownerId)
    expect(days).toBe(30)
  })

  it('setTrashRetentionDays persists', async () => {
    const { getTrashRetentionDays, setTrashRetentionDays } = await import(
      '@/lib/docs/settings-repo'
    )
    await setTrashRetentionDays(ownerId, 7)
    const days = await getTrashRetentionDays(ownerId)
    expect(days).toBe(7)
  })

  it('setTrashRetentionDays clamps negative to 0', async () => {
    const { getTrashRetentionDays, setTrashRetentionDays } = await import(
      '@/lib/docs/settings-repo'
    )
    await setTrashRetentionDays(ownerId, -5)
    const days = await getTrashRetentionDays(ownerId)
    expect(days).toBe(0)
  })
})

describe('E11 — purgeExpiredTrash', () => {
  it('purges a doc trashed 40 days ago but not one trashed today', async () => {
    const { createDocument, trashDocument, purgeExpiredTrash, listTrashed } = await import(
      '@/lib/docs/repo'
    )
    const { db, schema } = await import('@/db')
    const { eq, sql } = await import('drizzle-orm')

    const { id: oldDocId } = await createDocument(ownerId, { title: 'Old Trashed' })
    const { id: recentDocId } = await createDocument(ownerId, { title: 'Recent Trashed' })
    const { id: activeDocId } = await createDocument(ownerId, { title: 'Active Doc' })

    // Trash both docs
    await trashDocument(ownerId, oldDocId)
    await trashDocument(ownerId, recentDocId)

    // Backdate the old doc's trashed_at to 40 days ago
    await db
      .update(schema.documents)
      .set({ trashedAt: sql`now() - interval '40 days'` })
      .where(eq(schema.documents.id, oldDocId))

    const purged = await purgeExpiredTrash(ownerId, 30)
    expect(purged).toBeGreaterThanOrEqual(1)

    const remaining = await listTrashed(ownerId)
    const remainingIds = remaining.map((d) => d.id)

    // The old doc should be gone
    expect(remainingIds).not.toContain(oldDocId)
    // The recent doc should still be in trash
    expect(remainingIds).toContain(recentDocId)
    // The active (non-trashed) doc should be unaffected (not in trash list anyway)
    expect(remainingIds).not.toContain(activeDocId)
  })

  it('retentionDays 0 → purges nothing', async () => {
    const { createDocument, trashDocument, purgeExpiredTrash, listTrashed } = await import(
      '@/lib/docs/repo'
    )
    const { db, schema } = await import('@/db')
    const { eq, sql } = await import('drizzle-orm')

    const { id: docId } = await createDocument(ownerId, { title: 'Should Stay' })
    await trashDocument(ownerId, docId)
    // Backdate to 100 days ago
    await db
      .update(schema.documents)
      .set({ trashedAt: sql`now() - interval '100 days'` })
      .where(eq(schema.documents.id, docId))

    const purged = await purgeExpiredTrash(ownerId, 0)
    expect(purged).toBe(0)

    const remaining = await listTrashed(ownerId)
    expect(remaining.map((d) => d.id)).toContain(docId)
  })
})

describe('E11 — emptyTrash', () => {
  it('deletes all trashed docs and leaves non-trashed intact', async () => {
    const { createDocument, trashDocument, emptyTrash, listTrashed, listDocuments } = await import(
      '@/lib/docs/repo'
    )

    // Create docs for owner2 to avoid interference with owner
    const { id: doc1 } = await createDocument(owner2Id, { title: 'Trash A' })
    const { id: doc2 } = await createDocument(owner2Id, { title: 'Trash B' })
    const { id: doc3 } = await createDocument(owner2Id, { title: 'Active Keep' })

    await trashDocument(owner2Id, doc1)
    await trashDocument(owner2Id, doc2)
    // doc3 is NOT trashed

    const count = await emptyTrash(owner2Id)
    expect(count).toBeGreaterThanOrEqual(2)

    const trashed = await listTrashed(owner2Id)
    expect(trashed).toHaveLength(0)

    const active = await listDocuments(owner2Id)
    expect(active.map((d) => d.id)).toContain(doc3)
  })

  it('emptyTrash returns the count of deleted docs', async () => {
    const { createDocument, trashDocument, emptyTrash } = await import('@/lib/docs/repo')

    // Use a fresh sub-user by scoping to unique docs in owner
    const { id: d1 } = await createDocument(ownerId, { title: 'CountTest1' })
    const { id: d2 } = await createDocument(ownerId, { title: 'CountTest2' })
    await trashDocument(ownerId, d1)
    await trashDocument(ownerId, d2)

    const count = await emptyTrash(ownerId)
    // At minimum the 2 we just trashed (plus possibly others from previous tests)
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

describe('E11 — owner-scoping', () => {
  it("owner1's emptyTrash does not touch owner2's trashed docs", async () => {
    const { createDocument, trashDocument, emptyTrash, listTrashed } = await import(
      '@/lib/docs/repo'
    )

    // owner2 trashes a doc
    const { id: o2doc } = await createDocument(owner2Id, { title: 'Owner2 Trashed' })
    await trashDocument(owner2Id, o2doc)

    // owner1 empties trash — should not touch owner2's doc
    await emptyTrash(ownerId)

    const o2Trashed = await listTrashed(owner2Id)
    // The doc trashed by owner2 should still be present (unless owner2 already emptied above)
    // We verify that emptyTrash for owner1 didn't cascade to owner2
    // The o2doc should still be in owner2's trash or was removed only by owner2's own emptyTrash
    // Since we explicitly created and trashed it here, and only owner1 ran emptyTrash, it must remain
    expect(o2Trashed.map((d) => d.id)).toContain(o2doc)
  })

  it("owner1's purgeExpiredTrash does not touch owner2's old trashed docs", async () => {
    const { createDocument, trashDocument, purgeExpiredTrash, listTrashed } = await import(
      '@/lib/docs/repo'
    )
    const { db, schema } = await import('@/db')
    const { eq, sql } = await import('drizzle-orm')

    // owner2 trashes a very old doc
    const { id: o2oldDoc } = await createDocument(owner2Id, { title: 'Owner2 Old Trashed' })
    await trashDocument(owner2Id, o2oldDoc)
    await db
      .update(schema.documents)
      .set({ trashedAt: sql`now() - interval '60 days'` })
      .where(eq(schema.documents.id, o2oldDoc))

    // owner1 purges with 30-day window — must NOT touch owner2's doc
    await purgeExpiredTrash(ownerId, 30)

    const o2Trashed = await listTrashed(owner2Id)
    expect(o2Trashed.map((d) => d.id)).toContain(o2oldDoc)
  })
})
