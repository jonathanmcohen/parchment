import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E7: renameDocument + duplicateDocument against real Postgres.

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
  const u1 = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('doc-actions@p.local','Doc Actions User','owner') RETURNING id",
  )
  ownerId = u1.rows[0]?.id ?? ''

  const u2 = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('doc-actions-other@p.local','Other User','owner') RETURNING id",
  )
  otherOwnerId = u2.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('E7 — renameDocument', () => {
  it('changes title on success', async () => {
    const { createDocument, getDocument, renameDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'Original' })
    await renameDocument(ownerId, id, 'Renamed')
    const doc = await getDocument(id)
    expect(doc?.title).toBe('Renamed')
  })

  it('trims whitespace', async () => {
    const { createDocument, getDocument, renameDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'TrimTest' })
    await renameDocument(ownerId, id, '  Trimmed Title  ')
    const doc = await getDocument(id)
    expect(doc?.title).toBe('Trimmed Title')
  })

  it('rejects empty title', async () => {
    const { createDocument, renameDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'EmptyTest' })
    await expect(renameDocument(ownerId, id, '')).rejects.toThrow('empty title')
  })

  it('rejects whitespace-only title', async () => {
    const { createDocument, renameDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'WSTest' })
    await expect(renameDocument(ownerId, id, '   ')).rejects.toThrow('empty title')
  })

  it('is owner-scoped — a different owner cannot rename', async () => {
    const { createDocument, getDocument, renameDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'ScopedRename' })
    // renameDocument with wrong owner — silently no-ops (WHERE clause filters it out)
    await renameDocument(otherOwnerId, id, 'ShouldNotChange')
    const doc = await getDocument(id)
    expect(doc?.title).toBe('ScopedRename')
  })
})

describe('E7 — duplicateDocument', () => {
  it('creates a copy with "(copy)" suffix', async () => {
    const { createDocument, duplicateDocument, getDocument } = await import('@/lib/docs/repo')
    const { id: srcId } = await createDocument(ownerId, { title: 'Original Doc' })
    const { id: copyId } = await duplicateDocument(ownerId, srcId)
    expect(copyId).not.toBe(srcId)
    const copy = await getDocument(copyId)
    expect(copy?.title).toBe('Original Doc (copy)')
  })

  it('copy has same folderId', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, duplicateDocument, getDocument } = await import('@/lib/docs/repo')
    const { id: folderId } = await createFolder(ownerId, { name: 'DupFolder' })
    const { id: srcId } = await createDocument(ownerId, { folderId })
    const { id: copyId } = await duplicateDocument(ownerId, srcId)
    const copy = await getDocument(copyId)
    expect(copy?.folderId).toBe(folderId)
  })

  it('original doc is unchanged after duplicate', async () => {
    const { createDocument, duplicateDocument, getDocument } = await import('@/lib/docs/repo')
    const { id: srcId } = await createDocument(ownerId, { title: 'UnchangedSrc' })
    await duplicateDocument(ownerId, srcId)
    const src = await getDocument(srcId)
    expect(src?.title).toBe('UnchangedSrc')
  })

  it('copy is not starred and not trashed', async () => {
    const { createDocument, duplicateDocument, getDocument, setStarred } =
      await import('@/lib/docs/repo')
    const { id: srcId } = await createDocument(ownerId, { title: 'StarredSrc' })
    await setStarred(ownerId, srcId, true)
    const { id: copyId } = await duplicateDocument(ownerId, srcId)
    const copy = await getDocument(copyId)
    expect(copy?.starred).toBe(false)
    expect(copy?.trashedAt).toBeNull()
  })

  it('throws for non-owned source', async () => {
    const { createDocument, duplicateDocument } = await import('@/lib/docs/repo')
    const { id: srcId } = await createDocument(ownerId, { title: 'OtherOwner' })
    await expect(duplicateDocument(otherOwnerId, srcId)).rejects.toThrow('not found')
  })
})
