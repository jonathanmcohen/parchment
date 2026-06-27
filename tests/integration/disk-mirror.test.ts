import { readdirSync, readFileSync } from 'node:fs'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// F1: disk-mirror integration tests — real Postgres (Testcontainers) + real temp dir.

let container: StartedPostgreSqlContainer
let ownerId: string
let filesDir: string

const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  // Set up a real temp dir for files BEFORE any module imports
  filesDir = await mkdtemp(join(tmpdir(), 'parchment-test-'))
  process.env.PARCHMENT_FILES_ROOT = filesDir

  // Spin up Postgres
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
    "INSERT INTO users (email, name, role) VALUES ('mirror@p.local','Mirror User','owner') RETURNING id",
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

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('F1 — disk mirror write side', () => {
  it('saveDocument writes <root>/Title.md with the markdown content', async () => {
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'Hello World' })
    await saveDocument(id, {
      contentJson: {},
      markdown: '# Hello World\n\nSome content here.',
      title: 'Hello World',
    })

    const filePath = join(filesDir, 'Hello World.md')
    const exists = await fileExists(filePath)
    expect(exists).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('# Hello World\n\nSome content here.')
  })

  it('saveDocument in a folder writes under <root>/Folder/Title.md', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id: folderId } = await createFolder(ownerId, { name: 'MyFolder' })
    const { id } = await createDocument(ownerId, { title: 'Nested Doc', folderId })
    await saveDocument(id, {
      contentJson: {},
      markdown: '# Nested\n\nContent.',
      title: 'Nested Doc',
    })

    const filePath = join(filesDir, 'MyFolder', 'Nested Doc.md')
    const exists = await fileExists(filePath)
    expect(exists).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('# Nested\n\nContent.')
  })

  it('renameDocument relocates the file (old gone, new present)', async () => {
    const { createDocument, saveDocument, renameDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'OldTitle' })
    await saveDocument(id, { contentJson: {}, markdown: '# Old', title: 'OldTitle' })

    const oldPath = join(filesDir, 'OldTitle.md')
    expect(await fileExists(oldPath)).toBe(true)

    await renameDocument(ownerId, id, 'NewTitle')

    expect(await fileExists(oldPath)).toBe(false)
    const newPath = join(filesDir, 'NewTitle.md')
    expect(await fileExists(newPath)).toBe(true)
  })

  it('moveDocument to another folder relocates the file', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, saveDocument, moveDocument } = await import('@/lib/docs/repo')

    const { id: f1Id } = await createFolder(ownerId, { name: 'FolderA' })
    const { id: f2Id } = await createFolder(ownerId, { name: 'FolderB' })
    const { id } = await createDocument(ownerId, { title: 'MovingDoc', folderId: f1Id })
    await saveDocument(id, { contentJson: {}, markdown: '# Moving', title: 'MovingDoc' })

    const oldPath = join(filesDir, 'FolderA', 'MovingDoc.md')
    expect(await fileExists(oldPath)).toBe(true)

    await moveDocument(id, f2Id, ownerId)

    expect(await fileExists(oldPath)).toBe(false)
    const newPath = join(filesDir, 'FolderB', 'MovingDoc.md')
    expect(await fileExists(newPath)).toBe(true)
  })

  it('two same-titled docs in one folder get disambiguated: Title.md + Title (2).md', async () => {
    const { createFolder } = await import('@/lib/docs/folders-repo')
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')

    const { id: folderId } = await createFolder(ownerId, { name: 'SharedFolder' })

    const { id: id1 } = await createDocument(ownerId, { title: 'SameTitle', folderId })
    await saveDocument(id1, { contentJson: {}, markdown: '# First', title: 'SameTitle' })

    const { id: id2 } = await createDocument(ownerId, { title: 'SameTitle', folderId })
    await saveDocument(id2, { contentJson: {}, markdown: '# Second', title: 'SameTitle' })

    const path1 = join(filesDir, 'SharedFolder', 'SameTitle.md')
    const path2 = join(filesDir, 'SharedFolder', 'SameTitle (2).md')
    expect(await fileExists(path1)).toBe(true)
    expect(await fileExists(path2)).toBe(true)

    const c1 = await readFile(path1, 'utf8')
    const c2 = await readFile(path2, 'utf8')
    expect(c1).toBe('# First')
    expect(c2).toBe('# Second')
  })

  it('trashDocument removes the mirrored file', async () => {
    const { createDocument, saveDocument, trashDocument } = await import('@/lib/docs/repo')

    const { id } = await createDocument(ownerId, { title: 'ToTrash' })
    await saveDocument(id, { contentJson: {}, markdown: '# Trash me', title: 'ToTrash' })

    const filePath = join(filesDir, 'ToTrash.md')
    expect(await fileExists(filePath)).toBe(true)

    await trashDocument(ownerId, id)

    expect(await fileExists(filePath)).toBe(false)
  })

  it('restoreDocument re-creates the file', async () => {
    const { createDocument, saveDocument, trashDocument, restoreDocument } = await import(
      '@/lib/docs/repo'
    )

    const { id } = await createDocument(ownerId, { title: 'ToRestore' })
    await saveDocument(id, { contentJson: {}, markdown: '# Restore me', title: 'ToRestore' })

    await trashDocument(ownerId, id)
    const filePath = join(filesDir, 'ToRestore.md')
    expect(await fileExists(filePath)).toBe(false)

    await restoreDocument(ownerId, id)
    expect(await fileExists(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('# Restore me')
  })
})
