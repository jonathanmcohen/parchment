import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E4: tags CRUD + document_tags + listDocsForTag + tagCounts against real Postgres.

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
    "INSERT INTO users (email, name, role) VALUES ('tags@p.local','Tag User','owner') RETURNING id",
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

describe('E4 — tags repo', () => {
  it('createTag + listTags returns the created tag', async () => {
    const { createTag, listTags } = await import('@/lib/docs/tags-repo')
    const { id } = await createTag(ownerId, { name: 'My Tag', color: 'blue' })
    expect(id).toBeTruthy()
    const all = await listTags(ownerId)
    const found = all.find((t) => t.id === id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('My Tag')
    expect(found?.color).toBe('blue')
    expect(found?.ownerId).toBe(ownerId)
  })

  it('createTag defaults to DEFAULT_TAG_COLOR for unknown color', async () => {
    const { createTag, listTags } = await import('@/lib/docs/tags-repo')
    const { id } = await createTag(ownerId, { name: 'Default Color Tag', color: 'notacolor' })
    const all = await listTags(ownerId)
    const found = all.find((t) => t.id === id)
    expect(found?.color).toBe('slate')
  })

  it('createTag rejects empty name', async () => {
    const { createTag } = await import('@/lib/docs/tags-repo')
    await expect(createTag(ownerId, { name: '' })).rejects.toThrow('empty name')
    await expect(createTag(ownerId, { name: '   ' })).rejects.toThrow('empty name')
  })

  it('renameTag updates the name', async () => {
    const { createTag, listTags, renameTag } = await import('@/lib/docs/tags-repo')
    const { id } = await createTag(ownerId, { name: 'OldName' })
    await renameTag(ownerId, id, 'NewName')
    const all = await listTags(ownerId)
    const found = all.find((t) => t.id === id)
    expect(found?.name).toBe('NewName')
  })

  it('setTagColor updates the color', async () => {
    const { createTag, listTags, setTagColor } = await import('@/lib/docs/tags-repo')
    const { id } = await createTag(ownerId, { name: 'ColorTag', color: 'red' })
    await setTagColor(ownerId, id, 'green')
    const all = await listTags(ownerId)
    const found = all.find((t) => t.id === id)
    expect(found?.color).toBe('green')
  })

  it('setTagColor clamps invalid color to default', async () => {
    const { createTag, listTags, setTagColor } = await import('@/lib/docs/tags-repo')
    const { id } = await createTag(ownerId, { name: 'ClampTag', color: 'red' })
    await setTagColor(ownerId, id, 'invalid')
    const all = await listTags(ownerId)
    const found = all.find((t) => t.id === id)
    expect(found?.color).toBe('slate')
  })

  it('deleteTag removes the tag and cascades document_tags rows', async () => {
    const { createTag, deleteTag, listTags } = await import('@/lib/docs/tags-repo')
    const { createDocument } = await import('@/lib/docs/repo')
    const { addTagToDoc, listTagsForDoc } = await import('@/lib/docs/tags-repo')

    const { id: tagId } = await createTag(ownerId, { name: 'ToDelete' })
    const { id: docId } = await createDocument(ownerId, { title: 'DeleteCascadeDoc' })

    await addTagToDoc(ownerId, docId, tagId)
    const beforeDelete = await listTagsForDoc(ownerId, docId)
    expect(beforeDelete.find((t) => t.id === tagId)).toBeDefined()

    await deleteTag(ownerId, tagId)

    // Tag should be gone from listTags
    const all = await listTags(ownerId)
    expect(all.find((t) => t.id === tagId)).toBeUndefined()

    // document_tags row should be gone via cascade
    const afterDelete = await listTagsForDoc(ownerId, docId)
    expect(afterDelete.find((t) => t.id === tagId)).toBeUndefined()
  })

  it('addTagToDoc + listTagsForDoc includes it; idempotent (adding twice = one row)', async () => {
    const { createTag, addTagToDoc, listTagsForDoc } = await import('@/lib/docs/tags-repo')
    const { createDocument } = await import('@/lib/docs/repo')

    const { id: tagId } = await createTag(ownerId, { name: 'AddTag' })
    const { id: docId } = await createDocument(ownerId, { title: 'AddTagDoc' })

    await addTagToDoc(ownerId, docId, tagId)
    await addTagToDoc(ownerId, docId, tagId) // idempotent

    const tags = await listTagsForDoc(ownerId, docId)
    const matching = tags.filter((t) => t.id === tagId)
    expect(matching).toHaveLength(1)
  })

  it('removeTagFromDoc removes the assignment', async () => {
    const { createTag, addTagToDoc, removeTagFromDoc, listTagsForDoc } = await import(
      '@/lib/docs/tags-repo'
    )
    const { createDocument } = await import('@/lib/docs/repo')

    const { id: tagId } = await createTag(ownerId, { name: 'RemoveTag' })
    const { id: docId } = await createDocument(ownerId, { title: 'RemoveTagDoc' })

    await addTagToDoc(ownerId, docId, tagId)
    await removeTagFromDoc(ownerId, docId, tagId)

    const tags = await listTagsForDoc(ownerId, docId)
    expect(tags.find((t) => t.id === tagId)).toBeUndefined()
  })

  it('listDocsForTag returns tagged non-trashed docs; trashed excluded', async () => {
    const { createTag, addTagToDoc, listDocsForTag } = await import('@/lib/docs/tags-repo')
    const { createDocument, trashDocument } = await import('@/lib/docs/repo')

    const { id: tagId } = await createTag(ownerId, { name: 'FilterTag' })
    const { id: activeDocId } = await createDocument(ownerId, { title: 'ActiveDoc' })
    const { id: trashedDocId } = await createDocument(ownerId, { title: 'TrashedDoc' })

    await addTagToDoc(ownerId, activeDocId, tagId)
    await addTagToDoc(ownerId, trashedDocId, tagId)
    await trashDocument(ownerId, trashedDocId)

    const docs = await listDocsForTag(ownerId, tagId)
    expect(docs.find((d) => d.id === activeDocId)).toBeDefined()
    expect(docs.find((d) => d.id === trashedDocId)).toBeUndefined()
  })

  it('tagCounts returns correct counts', async () => {
    const { createTag, addTagToDoc, tagCounts } = await import('@/lib/docs/tags-repo')
    const { createDocument } = await import('@/lib/docs/repo')

    const { id: tagId } = await createTag(ownerId, { name: 'CountTag' })
    const { id: doc1 } = await createDocument(ownerId, { title: 'CountDoc1' })
    const { id: doc2 } = await createDocument(ownerId, { title: 'CountDoc2' })

    await addTagToDoc(ownerId, doc1, tagId)
    await addTagToDoc(ownerId, doc2, tagId)

    const counts = await tagCounts(ownerId)
    expect(counts[tagId]).toBe(2)
  })
})
