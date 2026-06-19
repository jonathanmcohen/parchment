import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// E2: views repo functions (listRecents, listStarred, listTrashed, setStarred, trashDocument, restoreDocument)

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
    "INSERT INTO users (email, name, role) VALUES ('views@p.local','Views User','owner') RETURNING id",
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

describe('E2 — views repo', () => {
  it('setStarred(true) → listStarred includes doc; setStarred(false) → excluded', async () => {
    const { createDocument, setStarred, listStarred } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'Star Me' })

    await setStarred(ownerId, id, true)
    let starred = await listStarred(ownerId)
    expect(starred.map((d) => d.id)).toContain(id)

    await setStarred(ownerId, id, false)
    starred = await listStarred(ownerId)
    expect(starred.map((d) => d.id)).not.toContain(id)
  })

  it('trashDocument → doc leaves listRecents, listStarred, listDocumentsInFolder; appears in listTrashed', async () => {
    const {
      createDocument,
      setStarred,
      trashDocument,
      listRecents,
      listStarred,
      listTrashed,
      listDocumentsInFolder,
    } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Trash Me' })
    await setStarred(ownerId, id, true)

    // Verify it appears in live views before trash
    let recents = await listRecents(ownerId)
    expect(recents.map((d) => d.id)).toContain(id)
    let starredList = await listStarred(ownerId)
    expect(starredList.map((d) => d.id)).toContain(id)
    let inFolder = await listDocumentsInFolder(ownerId, null)
    expect(inFolder.map((d) => d.id)).toContain(id)

    await trashDocument(ownerId, id)

    recents = await listRecents(ownerId)
    expect(recents.map((d) => d.id)).not.toContain(id)
    starredList = await listStarred(ownerId)
    expect(starredList.map((d) => d.id)).not.toContain(id)
    inFolder = await listDocumentsInFolder(ownerId, null)
    expect(inFolder.map((d) => d.id)).not.toContain(id)

    const trashed = await listTrashed(ownerId)
    expect(trashed.map((d) => d.id)).toContain(id)
  })

  it('restoreDocument → doc leaves listTrashed, reappears in listRecents', async () => {
    const { createDocument, trashDocument, restoreDocument, listRecents, listTrashed } =
      await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Restore Me' })
    await trashDocument(ownerId, id)

    let trashed = await listTrashed(ownerId)
    expect(trashed.map((d) => d.id)).toContain(id)

    await restoreDocument(ownerId, id)

    trashed = await listTrashed(ownerId)
    expect(trashed.map((d) => d.id)).not.toContain(id)

    const recents = await listRecents(ownerId)
    expect(recents.map((d) => d.id)).toContain(id)
  })

  it('listRecents returns newest-first and respects limit', async () => {
    const { createDocument, listRecents } = await import('@/lib/docs/repo')

    // Create 3 docs in sequence; small delays ensure distinct updatedAt timestamps
    const { id: id1 } = await createDocument(ownerId, { title: 'Oldest' })
    await new Promise((r) => setTimeout(r, 10))
    const { id: id2 } = await createDocument(ownerId, { title: 'Middle' })
    await new Promise((r) => setTimeout(r, 10))
    const { id: id3 } = await createDocument(ownerId, { title: 'Newest' })

    // With limit=2, only the 2 most recently created should appear
    const results = await listRecents(ownerId, 2)
    expect(results.length).toBe(2)

    // The 2 most recent are id3 and id2 — id1 (oldest) should not appear
    const ids = results.map((d) => d.id)
    expect(ids).toContain(id3)
    expect(ids).toContain(id2)
    expect(ids).not.toContain(id1)
  })

  it('starred column persists: create doc, star it, re-query returns starred=true', async () => {
    const { createDocument, setStarred, listStarred } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Persist Star' })
    await setStarred(ownerId, id, true)

    const starred = await listStarred(ownerId)
    const found = starred.find((d) => d.id === id)
    expect(found).toBeDefined()
    expect(found?.starred).toBe(true)
  })
})
