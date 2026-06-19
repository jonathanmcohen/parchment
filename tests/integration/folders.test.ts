import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E1: folder CRUD + listDocumentsInFolder + moveDocument against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
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

  // Seed a user
  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('folders@p.local','Folder User','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('E1 — folders repo', () => {
  it('createFolder + listFolders returns the created folder', async () => {
    const { createFolder, listFolders } = await import('@/lib/docs/folders-repo')
    const { id } = await createFolder(ownerId, { name: 'My Folder' })
    expect(id).toBeTruthy()
    const all = await listFolders(ownerId)
    const found = all.find((f) => f.id === id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('My Folder')
    expect(found?.parentId).toBeNull()
  })

  it('creates a nested folder (parent/child) persisting parentId', async () => {
    const { createFolder, listFolders } = await import('@/lib/docs/folders-repo')
    const { id: parentId } = await createFolder(ownerId, { name: 'Parent' })
    const { id: childId } = await createFolder(ownerId, { name: 'Child', parentId })
    const all = await listFolders(ownerId)
    const child = all.find((f) => f.id === childId)
    expect(child?.parentId).toBe(parentId)
  })

  it('moveFolder valid (child→root) works', async () => {
    const { createFolder, listFolders, moveFolder } = await import('@/lib/docs/folders-repo')
    const { id: parentId } = await createFolder(ownerId, { name: 'MoveParent' })
    const { id: childId } = await createFolder(ownerId, { name: 'MoveChild', parentId })

    await moveFolder(ownerId, childId, null)

    const all = await listFolders(ownerId)
    const child = all.find((f) => f.id === childId)
    expect(child?.parentId).toBeNull()
  })

  it('moveFolder cycle (parent under its own child) throws "cycle"', async () => {
    const { createFolder, moveFolder } = await import('@/lib/docs/folders-repo')
    const { id: parentId } = await createFolder(ownerId, { name: 'CycleParent' })
    const { id: childId } = await createFolder(ownerId, { name: 'CycleChild', parentId })

    await expect(moveFolder(ownerId, parentId, childId)).rejects.toThrow('cycle')
  })

  it('deleteFolder reparents child folder + child doc to grandparent', async () => {
    const { createFolder, deleteFolder, listFolders } = await import('@/lib/docs/folders-repo')
    const { listDocumentsInFolder } = await import('@/lib/docs/repo')

    // Create A > B > (doc in B, grandchild folder in B)
    const { id: aId } = await createFolder(ownerId, { name: 'DelA' })
    const { id: bId } = await createFolder(ownerId, { name: 'DelB', parentId: aId })
    const { id: gcId } = await createFolder(ownerId, { name: 'DelGC', parentId: bId })

    // Insert a doc in folder B via raw repo since createDocument doesn't need folder yet
    const { createDocument } = await import('@/lib/docs/repo')
    const { id: docId } = await createDocument(ownerId, { folderId: bId })

    // Delete B — B's children (gcId, docId) should reparent to A
    await deleteFolder(ownerId, bId)

    const allFolders = await listFolders(ownerId)
    const gc = allFolders.find((f) => f.id === gcId)
    expect(gc?.parentId).toBe(aId)

    // B should be gone
    expect(allFolders.find((f) => f.id === bId)).toBeUndefined()

    // Doc should now be in folder A
    const docsInA = await listDocumentsInFolder(ownerId, aId)
    expect(docsInA.find((d) => d.id === docId)).toBeDefined()
  })

  it('listDocumentsInFolder filters by folder and root (null)', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, listDocumentsInFolder } = await import('@/lib/docs/repo')

    const { id: folderId } = await createFolder(ownerId, { name: 'FilterFolder' })
    const { id: docInFolder } = await createDocument(ownerId, { folderId })
    const { id: rootDoc } = await createDocument(ownerId, {})

    const inFolder = await listDocumentsInFolder(ownerId, folderId)
    expect(inFolder.map((d) => d.id)).toContain(docInFolder)
    expect(inFolder.map((d) => d.id)).not.toContain(rootDoc)

    const atRoot = await listDocumentsInFolder(ownerId, null)
    expect(atRoot.map((d) => d.id)).toContain(rootDoc)
    expect(atRoot.map((d) => d.id)).not.toContain(docInFolder)
  })

  it('moveDocument moves a doc between folders and to root', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, listDocumentsInFolder, moveDocument } = await import('@/lib/docs/repo')

    const { id: f1Id } = await createFolder(ownerId, { name: 'MoveDocF1' })
    const { id: f2Id } = await createFolder(ownerId, { name: 'MoveDocF2' })
    const { id: docId } = await createDocument(ownerId, { folderId: f1Id })

    // Move to f2
    await moveDocument(docId, f2Id)
    let inF2 = await listDocumentsInFolder(ownerId, f2Id)
    expect(inF2.map((d) => d.id)).toContain(docId)

    // Move to root
    await moveDocument(docId, null)
    const atRoot = await listDocumentsInFolder(ownerId, null)
    expect(atRoot.map((d) => d.id)).toContain(docId)

    inF2 = await listDocumentsInFolder(ownerId, f2Id)
    expect(inF2.map((d) => d.id)).not.toContain(docId)
  })
})
