import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E3: smart folder CRUD + runSmartFolder against real Postgres.

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

  // Seed two users
  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('sf@p.local','Smart Folder User','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  const otherRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('sf-other@p.local','Other User','owner') RETURNING id",
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

describe('E3 — smart folders repo', () => {
  it('createSmartFolder + listSmartFolders returns the created folder', async () => {
    const { createSmartFolder, listSmartFolders } = await import('@/lib/docs/smart-folders-repo')
    const { id } = await createSmartFolder(ownerId, {
      name: 'My Smart Folder',
      criteria: { starred: true },
    })
    expect(id).toBeTruthy()
    const all = await listSmartFolders(ownerId)
    const found = all.find((sf) => sf.id === id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('My Smart Folder')
    expect(found?.criteria).toEqual({ starred: true })
  })

  it('createSmartFolder rejects empty name', async () => {
    const { createSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    await expect(createSmartFolder(ownerId, { name: '', criteria: {} })).rejects.toThrow(
      'empty name',
    )
    await expect(createSmartFolder(ownerId, { name: '   ', criteria: {} })).rejects.toThrow(
      'empty name',
    )
  })

  it('renameSmartFolder updates name', async () => {
    const { createSmartFolder, listSmartFolders, renameSmartFolder } = await import(
      '@/lib/docs/smart-folders-repo'
    )
    const { id } = await createSmartFolder(ownerId, { name: 'Old Name', criteria: {} })
    await renameSmartFolder(ownerId, id, 'New Name')
    const all = await listSmartFolders(ownerId)
    expect(all.find((sf) => sf.id === id)?.name).toBe('New Name')
  })

  it('updateSmartFolderCriteria updates criteria', async () => {
    const { createSmartFolder, listSmartFolders, updateSmartFolderCriteria } = await import(
      '@/lib/docs/smart-folders-repo'
    )
    const { id } = await createSmartFolder(ownerId, {
      name: 'Criteria Test',
      criteria: { starred: true },
    })
    await updateSmartFolderCriteria(ownerId, id, { titleContains: 'report' })
    const all = await listSmartFolders(ownerId)
    expect(all.find((sf) => sf.id === id)?.criteria).toEqual({ titleContains: 'report' })
  })

  it('deleteSmartFolder removes the folder (owner-scoped)', async () => {
    const { createSmartFolder, listSmartFolders, deleteSmartFolder } = await import(
      '@/lib/docs/smart-folders-repo'
    )
    const { id } = await createSmartFolder(ownerId, { name: 'Delete Me', criteria: {} })
    await deleteSmartFolder(ownerId, id)
    const all = await listSmartFolders(ownerId)
    expect(all.find((sf) => sf.id === id)).toBeUndefined()
  })

  it("deleteSmartFolder cannot delete another owner's folder", async () => {
    const { createSmartFolder, listSmartFolders, deleteSmartFolder } = await import(
      '@/lib/docs/smart-folders-repo'
    )
    const { id } = await createSmartFolder(ownerId, { name: 'Owner Only', criteria: {} })
    // delete by other owner — should be no-op (not throw)
    await deleteSmartFolder(otherOwnerId, id)
    const all = await listSmartFolders(ownerId)
    // folder still exists for owner
    expect(all.find((sf) => sf.id === id)).toBeDefined()
  })

  it('runSmartFolder: titleContains filters by substring (case-insensitive)', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: docId } = await createDocument(ownerId, { title: 'Annual Report 2026' })
    await createDocument(ownerId, { title: 'Meeting Notes' })

    const results = await runSmartFolder(ownerId, { titleContains: 'report' })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(docId)
    // Meeting Notes should not be in results
    const notMatching = results.find((d) => d.title === 'Meeting Notes')
    expect(notMatching).toBeUndefined()
  })

  it('runSmartFolder: starred:true returns only starred docs', async () => {
    const { createDocument, setStarred } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: starredId } = await createDocument(ownerId, { title: 'Starred Doc' })
    const { id: unstarredId } = await createDocument(ownerId, { title: 'Unstarred Doc' })
    await setStarred(ownerId, starredId, true)

    const results = await runSmartFolder(ownerId, { starred: true })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(starredId)
    expect(ids).not.toContain(unstarredId)
  })

  it('runSmartFolder: folderId filters by folder', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: folderId } = await createFolder(ownerId, { name: 'Smart Test Folder' })
    const { id: inFolderDoc } = await createDocument(ownerId, {
      title: 'In Folder Doc',
      folderId,
    })
    const { id: rootDoc } = await createDocument(ownerId, { title: 'Root Doc for FolderFilter' })

    const results = await runSmartFolder(ownerId, { folderId })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(inFolderDoc)
    expect(ids).not.toContain(rootDoc)
  })

  it('runSmartFolder: combined criteria AND together', async () => {
    const { createDocument, setStarred } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: matchId } = await createDocument(ownerId, { title: 'Starred Report Combined' })
    const { id: noStarId } = await createDocument(ownerId, { title: 'Report Not Starred' })
    const { id: noTitleId } = await createDocument(ownerId, { title: 'Starred But No Match' })
    await setStarred(ownerId, matchId, true)
    await setStarred(ownerId, noTitleId, true)

    const results = await runSmartFolder(ownerId, {
      titleContains: 'combined',
      starred: true,
    })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(matchId)
    expect(ids).not.toContain(noStarId)
    expect(ids).not.toContain(noTitleId)
  })

  it('runSmartFolder: trashed docs always excluded', async () => {
    const { createDocument, trashDocument } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: trashedId } = await createDocument(ownerId, { title: 'Trashed Document' })
    await trashDocument(ownerId, trashedId)

    const results = await runSmartFolder(ownerId, {})
    const ids = results.map((d) => d.id)
    expect(ids).not.toContain(trashedId)
  })

  it('runSmartFolder: empty criteria returns all non-trashed docs', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: doc1 } = await createDocument(ownerId, { title: 'All Docs Test 1' })
    const { id: doc2 } = await createDocument(ownerId, { title: 'All Docs Test 2' })

    const results = await runSmartFolder(ownerId, {})
    const ids = results.map((d) => d.id)
    expect(ids).toContain(doc1)
    expect(ids).toContain(doc2)
  })

  // J2-2 — broadened criteria
  it('runSmartFolder: tagId returns only docs carrying that tag', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc } = await import('@/lib/docs/tags-repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { id: tagId } = await createTag(ownerId, { name: 'sf-tag', color: 'red' })
    const { id: tagged } = await createDocument(ownerId, { title: 'Tagged for SF' })
    const { id: untagged } = await createDocument(ownerId, { title: 'Untagged for SF' })
    await addTagToDoc(ownerId, tagged, tagId)

    const results = await runSmartFolder(ownerId, { tagId })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(tagged)
    expect(ids).not.toContain(untagged)
  })

  it('runSmartFolder: tagId + updatedWithinDays AND together', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc } = await import('@/lib/docs/tags-repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')

    const { id: tagId } = await createTag(ownerId, { name: 'sf-recent', color: 'teal' })
    const { id: recent } = await createDocument(ownerId, { title: 'Recent Tagged' })
    const { id: old } = await createDocument(ownerId, { title: 'Old Tagged' })
    await addTagToDoc(ownerId, recent, tagId)
    await addTagToDoc(ownerId, old, tagId)
    // Push `old` outside the 7-day window.
    await db
      .update(schema.documents)
      .set({ updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.documents.id, old))

    const results = await runSmartFolder(ownerId, { tagId, updatedWithinDays: 7 })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(recent)
    expect(ids).not.toContain(old)
  })

  it('runSmartFolder: updatedWithinDays excludes stale docs', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { runSmartFolder } = await import('@/lib/docs/smart-folders-repo')
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')

    const { id: fresh } = await createDocument(ownerId, { title: 'Fresh Doc UWD' })
    const { id: stale } = await createDocument(ownerId, { title: 'Stale Doc UWD' })
    await db
      .update(schema.documents)
      .set({ updatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.documents.id, stale))

    const results = await runSmartFolder(ownerId, { updatedWithinDays: 30 })
    const ids = results.map((d) => d.id)
    expect(ids).toContain(fresh)
    expect(ids).not.toContain(stale)
  })
})
