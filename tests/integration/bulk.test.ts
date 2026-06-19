import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E6: bulk move / trash / tag operations against real Postgres.

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

  // Seed owner user
  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('bulk@p.local','Bulk User','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  // Seed a second user (for cross-owner assertions)
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

describe('E6 — bulk operations repo', () => {
  it('bulk move: moves all owned ids to a folder, ignores cross-owner ids', async () => {
    const { createDocument, listDocumentsInFolder, moveDocument } = await import('@/lib/docs/repo')
    const { createFolder } = await import('@/lib/docs/folders-repo')

    // Create a folder and two docs owned by ownerId
    const { id: folderId } = await createFolder(ownerId, { name: 'BulkMoveTarget' })
    const { id: docA } = await createDocument(ownerId, {})
    const { id: docB } = await createDocument(ownerId, {})

    // Create a doc owned by otherOwnerId — should NOT be moved
    const { id: otherDocId } = await createDocument(otherOwnerId, {})

    // Simulate what the bulk route does: for each id, check ownership then moveDocument
    const ids = [docA, docB, otherDocId]
    const { getDocument } = await import('@/lib/docs/repo')
    let affected = 0
    for (const id of ids) {
      const doc = await getDocument(id)
      if (!doc || doc.ownerId !== ownerId) continue
      await moveDocument(id, folderId)
      affected++
    }

    expect(affected).toBe(2)

    const inFolder = await listDocumentsInFolder(ownerId, folderId)
    expect(inFolder.map((d) => d.id)).toContain(docA)
    expect(inFolder.map((d) => d.id)).toContain(docB)

    // Other user's doc should still be at root (not in folderId)
    const otherDoc = await getDocument(otherDocId)
    expect(otherDoc?.folderId).toBeNull()
  })

  it('bulk move to root (null): moves docs to root', async () => {
    const { createDocument, listDocumentsInFolder, moveDocument } = await import('@/lib/docs/repo')
    const { createFolder } = await import('@/lib/docs/folders-repo')

    const { id: folderId } = await createFolder(ownerId, { name: 'BulkMoveRootSrc' })
    const { id: docA } = await createDocument(ownerId, { folderId })
    const { id: docB } = await createDocument(ownerId, { folderId })

    // Move both to root
    await moveDocument(docA, null)
    await moveDocument(docB, null)

    const atRoot = await listDocumentsInFolder(ownerId, null)
    expect(atRoot.map((d) => d.id)).toContain(docA)
    expect(atRoot.map((d) => d.id)).toContain(docB)
  })

  it('bulk trash: trashes selected docs; they leave listRecents and appear in listTrashed', async () => {
    const { createDocument, listRecents, listTrashed, trashDocument, getDocument } = await import(
      '@/lib/docs/repo'
    )

    const { id: docA } = await createDocument(ownerId, {})
    const { id: docB } = await createDocument(ownerId, {})

    // Verify they start in recents
    const beforeRecents = await listRecents(ownerId)
    expect(beforeRecents.map((d) => d.id)).toContain(docA)
    expect(beforeRecents.map((d) => d.id)).toContain(docB)

    // Simulate bulk route
    const ids = [docA, docB]
    let affected = 0
    for (const id of ids) {
      const doc = await getDocument(id)
      if (!doc || doc.ownerId !== ownerId) continue
      await trashDocument(ownerId, id)
      affected++
    }

    expect(affected).toBe(2)

    const afterRecents = await listRecents(ownerId)
    expect(afterRecents.map((d) => d.id)).not.toContain(docA)
    expect(afterRecents.map((d) => d.id)).not.toContain(docB)

    const trashed = await listTrashed(ownerId)
    expect(trashed.map((d) => d.id)).toContain(docA)
    expect(trashed.map((d) => d.id)).toContain(docB)
  })

  it('bulk trash: cross-owner doc is skipped (affected count excludes it)', async () => {
    const { createDocument, trashDocument, getDocument, listTrashed } = await import(
      '@/lib/docs/repo'
    )

    const { id: myDoc } = await createDocument(ownerId, {})
    const { id: otherDoc } = await createDocument(otherOwnerId, {})

    const ids = [myDoc, otherDoc]
    let affected = 0
    for (const id of ids) {
      const doc = await getDocument(id)
      if (!doc || doc.ownerId !== ownerId) continue
      await trashDocument(ownerId, id)
      affected++
    }

    expect(affected).toBe(1)

    // otherDoc should NOT be trashed
    const otherTrashed = await listTrashed(otherOwnerId)
    expect(otherTrashed.map((d) => d.id)).not.toContain(otherDoc)
  })

  it('bulk tag: tags all selected docs; each appears in listDocsForTag', async () => {
    const { createDocument, getDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc, listDocsForTag } = await import('@/lib/docs/tags-repo')

    const { id: tagId } = await createTag(ownerId, { name: 'BulkTag1' })
    const { id: docA } = await createDocument(ownerId, {})
    const { id: docB } = await createDocument(ownerId, {})

    const ids = [docA, docB]
    let affected = 0
    for (const id of ids) {
      const doc = await getDocument(id)
      if (!doc || doc.ownerId !== ownerId) continue
      await addTagToDoc(ownerId, id, tagId)
      affected++
    }

    expect(affected).toBe(2)

    const tagged = await listDocsForTag(ownerId, tagId)
    expect(tagged.map((d) => d.id)).toContain(docA)
    expect(tagged.map((d) => d.id)).toContain(docB)
  })

  it('bulk tag is idempotent (double-apply does not error or double-count)', async () => {
    const { createDocument, getDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc, listDocsForTag } = await import('@/lib/docs/tags-repo')

    const { id: tagId } = await createTag(ownerId, { name: 'BulkTagIdem' })
    const { id: docId } = await createDocument(ownerId, {})

    await addTagToDoc(ownerId, docId, tagId)
    // Second apply — should not throw
    await expect(addTagToDoc(ownerId, docId, tagId)).resolves.toBeUndefined()

    const tagged = await listDocsForTag(ownerId, tagId)
    // Only one entry
    expect(tagged.filter((d) => d.id === docId)).toHaveLength(1)
  })

  it('bulk tag: returns affected = number of owned ids acted on', async () => {
    const { createDocument, getDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc } = await import('@/lib/docs/tags-repo')

    const { id: tagId } = await createTag(ownerId, { name: 'BulkTagCount' })
    const { id: docA } = await createDocument(ownerId, {})
    const { id: docB } = await createDocument(ownerId, {})
    const { id: otherDoc } = await createDocument(otherOwnerId, {})

    const ids = [docA, docB, otherDoc]
    let affected = 0
    for (const id of ids) {
      const doc = await getDocument(id)
      if (!doc || doc.ownerId !== ownerId) continue
      try {
        await addTagToDoc(ownerId, id, tagId)
        affected++
      } catch {
        // skip
      }
    }

    expect(affected).toBe(2)
  })
})
