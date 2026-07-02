import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// v0.2.10 — INTEGRATION coverage for the one-shot heading-id disk-repair sweep,
// against a real Postgres (Testcontainers) + a real temp files root.
//
// Manufactures the legacy prod state: docs whose disk-mirror .md files carry
// multi-layer snowballed `<!-- id:… -->` comments AND whose DB content baked the
// literal comment text into a heading text node (the old-code import path). Then
// runs the sweep and asserts: polluted files rewritten to single-comment canonical
// markdown; DB heading text cleaned; fidelity-fragile nodes (footnoteRef) preserved;
// a CLEAN control doc left byte-for-byte untouched (mtime preserved); a doc holding a
// PENDING EXTERNAL EDIT skipped entirely; the completion flag set; a SECOND run a
// pure no-op; and the echo-suppression baseline (disk_synced_hash) advanced to the
// canonical hash so the reverse-sync watcher classifies the rewrite as 'echo'.

let container: StartedPostgreSqlContainer
let ownerId: string
let filesDir: string

const migrationsDir = path.resolve('src/db/migrations')

// The exact prod evidence: a heading snowballed multiple id-comment layers deep.
const SNOWBALLED_HEADING =
  '# Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes --> <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->'
const CANONICAL_HEADING = '# Release notes <!-- id:release-notes -->'

beforeAll(async () => {
  filesDir = await mkdtemp(join(tmpdir(), 'parchment-repair-'))
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
    "INSERT INTO users (email, name, role) VALUES ('repair@p.local','Repair User','owner') RETURNING id",
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

/**
 * Insert a doc row directly with an arbitrary markdown + content + disk_path and
 * write its .md file verbatim — bypassing repo.ts so we can plant EXACTLY the legacy
 * polluted bytes the fixed pipeline would never produce.
 */
async function plantDoc(opts: {
  title: string
  relPath: string
  markdown: string
  content: unknown
  syncedHash?: string | null
}): Promise<string> {
  const { db, schema } = await import('@/db')
  const { sha256 } = await import('@/lib/disk/hash')
  const [row] = await db
    .insert(schema.documents)
    .values({
      ownerId,
      title: opts.title,
      markdown: opts.markdown,
      content: opts.content as never,
      diskPath: opts.relPath,
      // Legacy docs were "in sync" on their polluted bytes.
      diskSyncedHash: opts.syncedHash === undefined ? sha256(opts.markdown) : opts.syncedHash,
    })
    .returning({ id: schema.documents.id })
  const id = row?.id ?? ''
  await writeFile(join(filesDir, opts.relPath), opts.markdown, 'utf8')
  return id
}

/** ProseMirror content whose heading TEXT NODE literally contains snowball comments. */
function pollutedContent(headingText: string) {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: headingText }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body paragraph.' }] },
    ],
  }
}

type PMish = { type?: string; content?: PMish[]; attrs?: Record<string, unknown>; text?: string }
function docHeadingText(content: unknown): string {
  const top = (content as PMish)?.content ?? []
  const h = top.find((n) => n.type === 'heading')
  return (h?.content ?? []).map((t) => t.text ?? '').join('')
}

describe('v0.2.10 heading-id disk-repair sweep (integration)', () => {
  it('heals polluted docs, preserves footnotes, skips pending edits + clean control, sets flag, second run no-op', async () => {
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { sha256 } = await import('@/lib/disk/hash')
    const { getSetting } = await import('@/lib/docs/settings-repo')
    const { runDiskRepairSweepOnce, DISK_REPAIR_HEADING_IDS_KEY, DISK_REPAIR_HEADING_IDS_VERSION } =
      await import('@/lib/disk/repair-heading-ids')

    // --- Plant fixtures ------------------------------------------------------
    // (A) polluted on disk AND in DB content (baked-in comment text node).
    const pollutedMd = `${SNOWBALLED_HEADING}\n\nBody paragraph.\n`
    const docA = await plantDoc({
      title: 'Release notes',
      relPath: 'Release notes.md',
      markdown: pollutedMd,
      content: pollutedContent(
        'Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->',
      ),
    })

    // (B) a second polluted doc in a subfolder (different snowball depth).
    await mkdir(join(filesDir, 'Guide'), { recursive: true })
    const pollutedMd2 = '## Setup <!-- id:setup --> <!-- id:setup-idsetup -->\n\nSteps.\n'
    const docB = await plantDoc({
      title: 'Setup',
      relPath: 'Guide/Setup.md',
      markdown: pollutedMd2,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Setup <!-- id:setup -->' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Steps.' }] },
        ],
      },
    })

    // (C) CLEAN control — canonical bytes on disk, clean content in DB. Must NOT
    // be written (mtime preserved).
    const cleanMd = `${CANONICAL_HEADING}\n\nAll good.\n`
    await plantDoc({
      title: 'Clean doc',
      relPath: 'Clean doc.md',
      markdown: cleanMd,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1, id: 'release-notes' },
            content: [{ type: 'text', text: 'Release notes' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'All good.' }] },
        ],
      },
    })

    // (D) polluted heading + FOOTNOTES — the sweep must heal the heading WITHOUT
    // degrading the footnoteRef (the lossy-parse hazard the surgical clean avoids).
    const footnoteMdPolluted =
      '# Notes <!-- id:notes --> <!-- id:notes-idnotes -->\n\nClaim[^1]\n\n[^1]: Source.\n'
    const docD = await plantDoc({
      title: 'Footnote doc',
      relPath: 'Footnote doc.md',
      markdown: footnoteMdPolluted,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Notes <!-- id:notes --> <!-- id:notes-idnotes -->' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Claim' },
              { type: 'footnoteRef', attrs: { number: 1 } },
            ],
          },
          {
            type: 'footnotes',
            content: [
              {
                type: 'footnoteItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Source.' }] }],
              },
            ],
          },
        ],
      },
    })

    // (E) PENDING EXTERNAL EDIT — polluted in DB, but the FILE was hand-edited and
    // not yet imported (bytes differ from both the baseline and the stored markdown).
    // The sweep must not touch the doc OR the file; reverse-sync owns it.
    const pendingStoredMd = '# Pending <!-- id:pending --> <!-- id:pending-idpending -->\n'
    const externalEdit = '# Pending — externally edited on disk\n\nNew user content.\n'
    const docE = await plantDoc({
      title: 'Pending doc',
      relPath: 'Pending doc.md',
      markdown: pendingStoredMd,
      content: pollutedContent('Pending <!-- id:pending -->'),
    })
    // Simulate the external edit AFTER planting (baseline stays sha(pendingStoredMd)).
    await writeFile(join(filesDir, 'Pending doc.md'), externalEdit, 'utf8')

    const cleanPath = join(filesDir, 'Clean doc.md')
    const cleanMtimeBefore = (await stat(cleanPath)).mtimeMs

    // --- Run the sweep -------------------------------------------------------
    const res1 = await runDiskRepairSweepOnce()
    expect(res1.skipped).toBe(false)
    if (res1.skipped === false) {
      expect(res1.scanned).toBe(5)
      // A + B + D healed in DB; C clean; E skipped (pending external edit).
      expect(res1.dbCleaned).toBe(3)
      expect(res1.fileRewritten).toBe(3)
      expect(res1.errors).toBe(0)
    }

    // --- Assert disk healed --------------------------------------------------
    const fileA = await readFile(join(filesDir, 'Release notes.md'), 'utf8')
    expect(fileA).toBe(`${CANONICAL_HEADING}\n\nBody paragraph.\n`)
    expect((fileA.match(/<!--\s*id:/g) ?? []).length).toBe(1) // exactly ONE id comment

    const fileB = await readFile(join(filesDir, 'Guide', 'Setup.md'), 'utf8')
    expect(fileB).toBe('## Setup <!-- id:setup -->\n\nSteps.\n')
    expect((fileB.match(/<!--\s*id:/g) ?? []).length).toBe(1)

    // --- Assert DB healed + echo-suppression baseline -------------------------
    const [rowA] = await db
      .select({
        content: schema.documents.content,
        markdown: schema.documents.markdown,
        hash: schema.documents.diskSyncedHash,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, docA))
    expect(docHeadingText(rowA?.content)).toBe('Release notes') // zero comment residue
    expect(rowA?.markdown).toBe(`${CANONICAL_HEADING}\n\nBody paragraph.\n`)
    // Baseline advanced to the canonical bytes' hash → the reverse-sync watcher
    // classifies our file rewrite as 'echo' (no re-import loop).
    expect(rowA?.hash).toBe(sha256(`${CANONICAL_HEADING}\n\nBody paragraph.\n`))

    // --- Assert footnote fidelity (docD) --------------------------------------
    const [rowD] = await db
      .select({ content: schema.documents.content, markdown: schema.documents.markdown })
      .from(schema.documents)
      .where(eq(schema.documents.id, docD))
    expect(docHeadingText(rowD?.content)).toBe('Notes')
    const dNodes = (rowD?.content as PMish)?.content ?? []
    // The footnoteRef node SURVIVES in content (a full-doc parse round trip would
    // have degraded it to literal text — the surgical clean never touches it).
    const dPara = dNodes.find((n) => n.type === 'paragraph')
    expect(dPara?.content?.some((n) => n.type === 'footnoteRef')).toBe(true)
    expect(dNodes.some((n) => n.type === 'footnotes')).toBe(true)
    // And the projections keep the GFM footnote forms.
    expect(rowD?.markdown).toBe('# Notes <!-- id:notes -->\n\nClaim[^1]\n\n[^1]: Source.\n')
    const fileD = await readFile(join(filesDir, 'Footnote doc.md'), 'utf8')
    expect(fileD).toBe('# Notes <!-- id:notes -->\n\nClaim[^1]\n\n[^1]: Source.\n')

    // --- Assert pending-external-edit doc COMPLETELY untouched (docE) ---------
    const fileE = await readFile(join(filesDir, 'Pending doc.md'), 'utf8')
    expect(fileE).toBe(externalEdit) // the user's edit was NOT clobbered
    const [rowE] = await db
      .select({
        content: schema.documents.content,
        markdown: schema.documents.markdown,
        hash: schema.documents.diskSyncedHash,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, docE))
    expect(rowE?.markdown).toBe(pendingStoredMd) // DB untouched too
    expect(rowE?.hash).toBe(sha256(pendingStoredMd)) // baseline NOT advanced
    // Residue left for reverse-sync to heal on import (v0.2.9 parse strips it there).
    expect(docHeadingText(rowE?.content)).toContain('<!-- id:pending -->')

    // --- Assert clean control UNTOUCHED (byte-identical + mtime preserved) ----
    const fileC = await readFile(cleanPath, 'utf8')
    expect(fileC).toBe(cleanMd)
    expect((await stat(cleanPath)).mtimeMs).toBe(cleanMtimeBefore)

    // --- Flag set ------------------------------------------------------------
    // (jsonb numeric-string round-trips back as a number — see the module note; the
    // gate compares on String(...), so assert the same way.)
    const flag = await getSetting<unknown>(ownerId, DISK_REPAIR_HEADING_IDS_KEY, null)
    expect(String(flag)).toBe(DISK_REPAIR_HEADING_IDS_VERSION)

    // --- Second run: pure no-op (fast-path skip, no writes, mtimes unchanged) --
    const mtimeA1 = (await stat(join(filesDir, 'Release notes.md'))).mtimeMs
    const res2 = await runDiskRepairSweepOnce()
    expect(res2.skipped).toBe(true)
    expect((await stat(join(filesDir, 'Release notes.md'))).mtimeMs).toBe(mtimeA1)
    void docB
  }, 120_000)

  it('isolates a corrupt doc — one bad row never aborts the sweep or leaves the flag unset', async () => {
    // Fresh flag state so this sweep actually runs: clear the marker planted above.
    const { db, schema } = await import('@/db')
    const { and, eq } = await import('drizzle-orm')
    const { getSetting } = await import('@/lib/docs/settings-repo')
    const { runDiskRepairSweepOnce, repairDocument, DISK_REPAIR_HEADING_IDS_KEY } = await import(
      '@/lib/disk/repair-heading-ids'
    )

    // Un-set the flag (delete the settings row) so the sweep re-runs.
    await db
      .delete(schema.settings)
      .where(
        and(
          eq(schema.settings.ownerId, ownerId),
          eq(schema.settings.key, DISK_REPAIR_HEADING_IDS_KEY),
        ),
      )

    // A doc whose disk_path points OUTSIDE the files root resolves to a nonexistent
    // location; repairDocument must swallow the read failure (missing file → DB-only
    // heal) and NEVER throw.
    const badId = await plantDoc({
      title: 'Bad doc',
      relPath: 'Bad doc.md',
      markdown: `${SNOWBALLED_HEADING}\n`,
      content: pollutedContent('Bad <!-- id:bad --> <!-- id:bad-idbad -->'),
    })
    await db
      .update(schema.documents)
      .set({ diskPath: '../../../../nonexistent-dir/does-not-exist.md' })
      .where(eq(schema.documents.id, badId))

    const [badRow] = await db
      .select({
        id: schema.documents.id,
        content: schema.documents.content,
        markdown: schema.documents.markdown,
        diskPath: schema.documents.diskPath,
        diskSyncedHash: schema.documents.diskSyncedHash,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, badId))
    // Must never throw; the missing file is skipped and the DB still heals.
    const r = await repairDocument(badRow as never)
    expect(r.errored).toBe(false)
    expect(r.dbCleaned).toBe(true)
    expect(r.fileRewritten).toBe(false)

    // The whole sweep still completes and SETS the flag despite any bad rows.
    const res = await runDiskRepairSweepOnce()
    expect(res.skipped).toBe(false)
    const flag = await getSetting<unknown>(ownerId, DISK_REPAIR_HEADING_IDS_KEY, null)
    expect(String(flag)).toBe('1')
  }, 120_000)
})
