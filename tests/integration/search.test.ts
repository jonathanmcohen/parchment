import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E9: FTS + semantic search against real Postgres + pgvector.

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
    "INSERT INTO users (email, name, role) VALUES ('search@p.local','Search User','owner') RETURNING id",
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

describe('E9 — full-text search', () => {
  it('finds a doc by a word in its title', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Quantum Physics Notes' })
    await saveDocument(id, { contentJson: {}, markdown: 'Introduction to quantum mechanics', title: 'Quantum Physics Notes' })

    const results = await searchFullText(ownerId, 'quantum')
    expect(results.map((r) => r.id)).toContain(id)
  })

  it('finds a doc by a word in its body (markdown)', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Meeting notes July' })
    await saveDocument(id, {
      contentJson: {},
      markdown: 'We discussed thermodynamics at length',
      title: 'Meeting notes July',
    })

    const results = await searchFullText(ownerId, 'thermodynamics')
    expect(results.map((r) => r.id)).toContain(id)
  })

  it('ranks title matches higher than body-only matches', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id: titleId } = await createDocument(ownerId, { title: 'Astrophysics deep dive' })
    await saveDocument(titleId, {
      contentJson: {},
      markdown: 'A short description',
      title: 'Astrophysics deep dive',
    })

    const { id: bodyId } = await createDocument(ownerId, { title: 'Random document' })
    await saveDocument(bodyId, {
      contentJson: {},
      markdown: 'This document is about astrophysics and its many branches',
      title: 'Random document',
    })

    const results = await searchFullText(ownerId, 'astrophysics')
    const ids = results.map((r) => r.id)
    expect(ids).toContain(titleId)
    expect(ids).toContain(bodyId)
    // Title match should rank first
    expect(ids.indexOf(titleId)).toBeLessThan(ids.indexOf(bodyId))
  })

  it('excludes trashed documents', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument, trashDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Deleted chemistry notes' })
    await saveDocument(id, {
      contentJson: {},
      markdown: 'Chemistry is fascinating electrovalent bonding',
      title: 'Deleted chemistry notes',
    })
    await trashDocument(ownerId, id)

    const results = await searchFullText(ownerId, 'electrovalent')
    expect(results.map((r) => r.id)).not.toContain(id)
  })

  it('returns [] for blank query', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const results = await searchFullText(ownerId, '')
    expect(results).toEqual([])
    const results2 = await searchFullText(ownerId, '   ')
    expect(results2).toEqual([])
  })

  it('filters by starred', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument, setStarred } = await import('@/lib/docs/repo')

    const { id: starredId } = await createDocument(ownerId, { title: 'Stargazing guide biology' })
    await saveDocument(starredId, {
      contentJson: {},
      markdown: 'xenobiology is the study of extraterrestrial life',
      title: 'Stargazing guide biology',
    })
    await setStarred(ownerId, starredId, true)

    const { id: notStarredId } = await createDocument(ownerId, { title: 'Non-starred xenobiology doc' })
    await saveDocument(notStarredId, {
      contentJson: {},
      markdown: 'xenobiology also covers astrobiology topics',
      title: 'Non-starred xenobiology doc',
    })

    const results = await searchFullText(ownerId, 'xenobiology', { starred: true })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(starredId)
    expect(ids).not.toContain(notStarredId)
  })

  it('filters by folderId', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id: folderId } = await createFolder(ownerId, { name: 'Physics Folder' })

    const { id: inFolderDocId } = await createDocument(ownerId, { title: 'Optics in folder', folderId })
    await saveDocument(inFolderDocId, {
      contentJson: {},
      markdown: 'Fresnel diffraction is a wave optics phenomenon',
      title: 'Optics in folder',
    })

    const { id: rootDocId } = await createDocument(ownerId, { title: 'Optics at root' })
    await saveDocument(rootDocId, {
      contentJson: {},
      markdown: 'Fresnel diffraction also happens in everyday optics',
      title: 'Optics at root',
    })

    const results = await searchFullText(ownerId, 'diffraction', { folderId })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(inFolderDocId)
    expect(ids).not.toContain(rootDocId)
  })

  it('filters by tagId', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')
    const { createTag, addTagToDoc } = await import('@/lib/docs/tags-repo')

    const { id: tagId } = await createTag(ownerId, { name: 'science' })

    const { id: taggedId } = await createDocument(ownerId, { title: 'Gravitational waves tagged' })
    await saveDocument(taggedId, {
      contentJson: {},
      markdown: 'Interferometry detects gravitational waves from merging black holes',
      title: 'Gravitational waves tagged',
    })
    await addTagToDoc(ownerId, taggedId, tagId)

    const { id: untaggedId } = await createDocument(ownerId, { title: 'Gravitational waves untagged' })
    await saveDocument(untaggedId, {
      contentJson: {},
      markdown: 'Interferometry is also used in optical coherence tomography',
      title: 'Gravitational waves untagged',
    })

    const results = await searchFullText(ownerId, 'interferometry', { tagId })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(taggedId)
    expect(ids).not.toContain(untaggedId)
  })
})

describe('E9 — semantic search', () => {
  it('returns the nearest document first based on cosine distance', async () => {
    const { searchSemantic } = await import('@/lib/docs/search-repo')
    const { createDocument } = await import('@/lib/docs/repo')

    const { id: nearId } = await createDocument(ownerId, { title: 'Near doc' })
    const { id: farId } = await createDocument(ownerId, { title: 'Far doc' })

    // Use raw pg to set embeddings
    const c = new Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()

    // nearDoc embedding: mostly 1s in first dimension
    const nearVec = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1.0 : 0.0))
    // farDoc embedding: mostly 1s in last dimension
    const farVec = Array.from({ length: 768 }, (_, i) => (i === 767 ? 1.0 : 0.0))

    await c.query(`UPDATE documents SET embedding = $1::vector WHERE id = $2`, [
      `[${nearVec.join(',')}]`,
      nearId,
    ])
    await c.query(`UPDATE documents SET embedding = $1::vector WHERE id = $2`, [
      `[${farVec.join(',')}]`,
      farId,
    ])
    await c.end()

    // Query vector that is identical to nearVec — so nearId should be first (distance 0)
    const results = await searchSemantic(ownerId, nearVec)
    const ids = results.map((r) => r.id)
    expect(ids).toContain(nearId)
    expect(ids).toContain(farId)
    expect(ids.indexOf(nearId)).toBeLessThan(ids.indexOf(farId))
  })

  it('excludes documents with no embedding', async () => {
    const { searchSemantic } = await import('@/lib/docs/search-repo')
    const { createDocument } = await import('@/lib/docs/repo')

    const { id: noEmbedId } = await createDocument(ownerId, { title: 'No embedding doc' })
    // Don't set embedding for this doc

    const queryVec = Array.from({ length: 768 }, () => 0.5)
    const results = await searchSemantic(ownerId, queryVec)
    expect(results.map((r) => r.id)).not.toContain(noEmbedId)
  })

  it('excludes trashed docs from semantic search', async () => {
    const { searchSemantic } = await import('@/lib/docs/search-repo')
    const { createDocument, trashDocument } = await import('@/lib/docs/repo')

    const { id: trashedId } = await createDocument(ownerId, { title: 'Trashed with embedding' })

    const c = new Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()
    const vec = Array.from({ length: 768 }, () => 0.3)
    await c.query(`UPDATE documents SET embedding = $1::vector WHERE id = $2`, [
      `[${vec.join(',')}]`,
      trashedId,
    ])
    await c.end()

    await trashDocument(ownerId, trashedId)

    const results = await searchSemantic(ownerId, vec)
    expect(results.map((r) => r.id)).not.toContain(trashedId)
  })
})
