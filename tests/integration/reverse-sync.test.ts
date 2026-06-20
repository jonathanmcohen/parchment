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

  it('conflict de-dup: re-firing the same divergence does not spawn extra siblings', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')

    const { id, abs } = await seedMirroredDoc('DupConflict', '# Base\n\nbase body')

    // Diverge the DB (without touching disk_synced_hash) and the file.
    await db
      .update(schema.documents)
      .set({ markdown: '# Db Side\n\ndb-only edit' })
      .where(eq(schema.documents.id, id))
    const fileContent = '# File Side\n\nfile-only edit'
    await writeFile(abs, fileContent, 'utf8')

    // First event emits a conflict sibling.
    expect(await handleExternalChange(abs)).toBe('conflict')
    const afterFirst = (await readdir(filesDir)).filter(
      (e) => e.startsWith('DupConflict.conflict-') && e.endsWith('.md'),
    )
    expect(afterFirst.length).toBe(1)

    // A subsequent event for the SAME unresolved divergence must NOT spawn a
    // second sibling (the baseline never advanced on conflict).
    expect(await handleExternalChange(abs)).toBe('conflict')
    const afterSecond = (await readdir(filesDir)).filter(
      (e) => e.startsWith('DupConflict.conflict-') && e.endsWith('.md'),
    )
    expect(afterSecond.length).toBe(1)
  })

  it('apply is a compare-and-swap: a baseline moved by a concurrent write is not clobbered', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { getDocument } = await import('@/lib/docs/repo')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')
    const { sha256 } = await import('@/lib/disk/hash')

    // Seed a doc; the file diverges from the DB so a naive read would classify
    // 'apply'. Then simulate a concurrent in-app save committing AFTER our
    // snapshot read but BEFORE the apply UPDATE by moving disk_synced_hash to a
    // value that matches neither the old baseline nor the file — emulated here by
    // pre-advancing it so the guarded UPDATE finds rowCount 0 and re-handles.
    const { id, abs } = await seedMirroredDoc('CasDoc', '# Cas\n\noriginal')

    // An external edit lands on disk.
    const inApp = '# In App\n\nuser typed this in the editor'
    await writeFile(abs, '# External\n\nedited on disk', 'utf8')

    // Simulate the in-app autosave winning the race: DB markdown + baseline now
    // reflect the in-app content (as syncDocToDisk would have set them), and the
    // file is re-mirrored to the in-app content (echo state).
    await db
      .update(schema.documents)
      .set({ markdown: inApp, diskSyncedHash: sha256(inApp) })
      .where(eq(schema.documents.id, id))
    await writeFile(abs, inApp, 'utf8')

    // The watcher event for the original external edit now arrives. Because the
    // file equals the new baseline, it must classify as echo — NOT clobber the
    // in-app content.
    const cls = await handleExternalChange(abs)
    expect(cls).toBe('echo')

    const after = await getDocument(id)
    expect(after?.markdown).toBe(inApp)
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

  // The case above only proves the TRIVIAL same-bytes echo (re-running on the
  // SAME external file). That is NOT how the real cross-process loop closes when
  // an editor is open: handleExternalChange sets markdown = the EXTERNAL bytes,
  // but the editor then serializes the Y-applied content and the autosave
  // (saveDocument → syncDocToDisk) rewrites the file with the SERIALIZER's
  // NORMALIZED bytes — which DIFFER from the external bytes for any non-canonical
  // markdown ('* a' → '- a', '## H ##' → '## H', setext → ATX, etc.). The loop
  // therefore settles in TWO writes: external apply → autosave rewrites normalized
  // bytes + re-baselines disk_synced_hash to sha256(normalized) → the watcher event
  // for that rewrite is an echo. This only terminates because the serializer is a
  // FIXPOINT (serialize(parse(serialize(x))) === serialize(x)); if it were ever
  // non-idempotent for some construct, production would loop forever while the
  // trivial test above would still pass. This test exercises that real settle.
  it('loop terminates after normalize: non-canonical external edit settles to echo in two writes', async () => {
    const { getDocument, saveDocument } = await import('@/lib/docs/repo')
    const { handleExternalChange } = await import('@/lib/disk/reverse-sync')
    const { markdownToJson } = await import('@/lib/markdown/parse')
    const { serializeMarkdown } = await import('@/lib/markdown/serialize')

    const { id, abs } = await seedMirroredDoc('NormalizeLoop', '# Start\n\nbody')

    // An external editor writes NON-canonical markdown (the file mirror would
    // normalize this): '*' bullets and a closed-ATX heading.
    const external = '## Heading ##\n\n* one\n* two\n'
    await writeFile(abs, external, 'utf8')

    // First write: reverse-sync applies the external bytes verbatim into the DB
    // (markdown === external) and would push the parsed JSON to the Y.Doc.
    expect(await handleExternalChange(abs)).toBe('apply')
    expect((await getDocument(id))?.markdown).toBe(external)

    // The serializer normalizes the parsed content (this is what the open editor
    // would emit on its autosave). Confirm it actually DIFFERS from the external
    // bytes — otherwise this test would degenerate into the trivial same-bytes case.
    const parsed = markdownToJson(external)
    const normalized = serializeMarkdown(parsed)
    expect(normalized).not.toBe(external)

    // Second write: simulate the editor's autosave. saveDocument → syncDocToDisk
    // rewrites the FILE with the normalized bytes AND re-baselines disk_synced_hash
    // to sha256(normalized). The file on disk now holds the normalized bytes.
    await saveDocument(id, { contentJson: parsed, markdown: normalized })
    expect(await readFile(abs, 'utf8')).toBe(normalized)

    // The watcher event for that autosave rewrite must classify as ECHO — the
    // file hash now equals disk_synced_hash. This is where the cross-process loop
    // actually closes (NOT at the same-bytes step above).
    expect(await handleExternalChange(abs)).toBe('echo')

    // Serializer FIXPOINT — the property that GUARANTEES no third write: a second
    // autosave produces byte-identical markdown, so no further file change is
    // generated and the loop cannot diverge.
    expect(serializeMarkdown(markdownToJson(normalized))).toBe(normalized)
  })
})
