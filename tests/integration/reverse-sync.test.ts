import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// F2: reverse-sync integration — real Postgres (Testcontainers) + real temp dir.
// We call handleExternalChange directly; the chokidar watcher is just the event
// source and is intentionally NOT started here.

let container: StartedPostgreSqlContainer
let ownerId: string
let filesDir: string

const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  // Set up a real temp dir for files BEFORE any module imports.
  filesDir = await mkdtemp(join(tmpdir(), 'parchment-rsync-'))
  process.env.PARCHMENT_FILES_ROOT = filesDir

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
    "INSERT INTO users (email, name, role) VALUES ('rsync@p.local','Rsync User','owner') RETURNING id",
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

/** Create + mirror a doc; returns its id and absolute mirrored path. */
async function seedMirroredDoc(
  title: string,
  markdown: string,
): Promise<{ id: string; abs: string }> {
  const { createDocument, saveDocument } = await import('@/lib/docs/repo')
  const { id } = await createDocument(ownerId, { title })
  await saveDocument(id, { contentJson: {}, markdown, title })
  const abs = join(filesDir, `${title}.md`)
  return { id, abs }
}

describe('F2 — reverse sync', () => {
  it('external edit applies: file→doc, content JSON + synced hash updated', async () => {
    const { getDocument } = await import('@/lib/docs/repo')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const { id, abs } = await seedMirroredDoc('ExtEdit', '# Original\n\nold body')

    const before = await getDocument(id)
    const baselineHash = before?.diskSyncedHash

    // Simulate an external editor overwriting the .md.
    const edited = '# Brand New Heading\n\nfresh **content**'
    await writeFile(abs, edited, 'utf8')

    const cls = await handleExternalChange(abs)
    expect(cls).toBe('apply')

    const after = await getDocument(id)
    expect(after?.markdown).toBe(edited)
    // disk_synced_hash advanced to the new file's hash.
    expect(after?.diskSyncedHash).not.toBe(baselineHash)
    // content JSON reflects the new heading.
    const json = JSON.stringify(after?.content ?? {})
    expect(json).toContain('Brand New Heading')
    expect(json).toContain('heading')
  })

  it('echo ignored: file content equals current markdown → no-op', async () => {
    const { getDocument } = await import('@/lib/docs/repo')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const md = '# Echo\n\nsame body'
    const { id, abs } = await seedMirroredDoc('EchoDoc', md)

    const before = await getDocument(id)

    // Rewrite the file with content identical to current markdown → hash == synced.
    await writeFile(abs, md, 'utf8')

    const cls = await handleExternalChange(abs)
    expect(cls).toBe('echo')

    const after = await getDocument(id)
    expect(after?.markdown).toBe(before?.markdown)
    expect(after?.diskSyncedHash).toBe(before?.diskSyncedHash)
    expect(after?.updatedAt?.getTime()).toBe(before?.updatedAt?.getTime())
  })

  it('conflict: DB and file both diverged → conflict sibling written, doc untouched', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { getDocument } = await import('@/lib/docs/repo')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const { id, abs } = await seedMirroredDoc('ConflictDoc', '# Base\n\nbase body')

    // Diverge the DB directly (X) WITHOUT touching disk_synced_hash.
    const dbContent = '# Db Side\n\ndb-only edit'
    await db
      .update(schema.documents)
      .set({ markdown: dbContent })
      .where(eq(schema.documents.id, id))

    // Diverge the file to a DIFFERENT content (Y).
    const fileContent = '# File Side\n\nfile-only edit'
    await writeFile(abs, fileContent, 'utf8')

    const cls = await handleExternalChange(abs)
    expect(cls).toBe('conflict')

    // The doc still holds X (not clobbered).
    const after = await getDocument(id)
    expect(after?.markdown).toBe(dbContent)

    // A `*.conflict-*.md` sibling exists containing Y.
    const entries = await readdir(filesDir)
    const conflict = entries.find((e) => e.startsWith('ConflictDoc.conflict-') && e.endsWith('.md'))
    expect(conflict).toBeDefined()
    const conflictBody = await readFile(join(filesDir, conflict as string), 'utf8')
    expect(conflictBody).toBe(fileContent)
  })

  it('unmanaged file: no matching disk_path → echo, no throw, no doc created', async () => {
    const { db, schema } = await import('@/db')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const before = await db.select({ id: schema.documents.id }).from(schema.documents)

    const abs = join(filesDir, 'Unmanaged Floating File.md')
    await writeFile(abs, '# Nobody owns me', 'utf8')

    const cls = await handleExternalChange(abs)
    expect(cls).toBe('echo')

    const after = await db.select({ id: schema.documents.id }).from(schema.documents)
    expect(after.length).toBe(before.length)
  })

  it('loop terminates: applying an edit then re-running classifies as echo', async () => {
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const { abs } = await seedMirroredDoc('LoopDoc', '# Loop\n\nstart')

    await writeFile(abs, '# Loop\n\nexternally changed', 'utf8')
    expect(await handleExternalChange(abs)).toBe('apply')
    // disk_synced_hash now equals the file hash → a second event is an echo.
    expect(await handleExternalChange(abs)).toBe('echo')
  })
})
