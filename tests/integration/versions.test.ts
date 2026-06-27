import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// D3: version history repo — create / list / getVersion / pruneAutosaves against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
let docId: string
const migrationsDir = path.resolve('src/db/migrations')

// Inline CREATE TABLE for doc_versions. The controller generates the real migration later;
// this keeps the test self-contained until that file exists.
const DOC_VERSIONS_DDL = `
CREATE TABLE IF NOT EXISTS "doc_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "doc_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "label" text,
  "kind" text NOT NULL DEFAULT 'auto',
  "content" jsonb,
  "markdown" text NOT NULL DEFAULT '',
  "author_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "doc_versions_doc_created_idx" ON "doc_versions" ("doc_id", "created_at");
`

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()

  // Apply existing migrations
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }

  // Apply doc_versions DDL if the real migration doesn't exist yet
  const hasMigration = readdirSync(migrationsDir).some(
    (f) =>
      f.endsWith('.sql') &&
      readFileSync(path.join(migrationsDir, f), 'utf8').includes('"doc_versions"'),
  )
  if (!hasMigration) {
    await c.query(DOC_VERSIONS_DDL)
  }

  // Seed: user + document
  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('versions@p.local','Versioner','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  const docRes = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Version Test Doc', $1, 'initial\n') RETURNING id`,
    [ownerId],
  )
  docId = docRes.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('D3 — versions repo', () => {
  it('createVersion (named) returns an id', async () => {
    const { createVersion } = await import('@/lib/docs/versions-repo')
    const result = await createVersion(docId, {
      kind: 'named',
      label: 'v1.0',
      content: { type: 'doc', content: [] },
      markdown: '# Hello\n',
      authorId: ownerId,
    })
    expect(result.id).toBeTruthy()
  })

  it('createVersion (auto) stores without label', async () => {
    const { createVersion, getVersion } = await import('@/lib/docs/versions-repo')
    const { id } = await createVersion(docId, {
      kind: 'auto',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      markdown: 'paragraph\n',
    })
    const v = await getVersion(id, docId)
    expect(v).not.toBeNull()
    expect(v?.label).toBeNull()
    expect(v?.kind).toBe('auto')
  })

  it('listVersions returns summaries newest first, without content', async () => {
    const { createVersion, listVersions } = await import('@/lib/docs/versions-repo')

    await createVersion(docId, { kind: 'auto', content: {}, markdown: 'A\n' })
    await createVersion(docId, { kind: 'named', label: 'checkpoint', content: {}, markdown: 'B\n' })

    const list = await listVersions(docId)
    expect(list.length).toBeGreaterThanOrEqual(2)

    // newest first
    const dates = list.map((v) => new Date(v.createdAt).getTime())
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1] ?? 0
      const curr = dates[i] ?? 0
      expect(prev).toBeGreaterThanOrEqual(curr)
    }

    // summaries don't include content or markdown
    for (const v of list) {
      expect(v).not.toHaveProperty('content')
      expect(v).not.toHaveProperty('markdown')
      expect(typeof v.id).toBe('string')
      expect(typeof v.kind).toBe('string')
    }
  })

  it('getVersion returns full content + markdown', async () => {
    const { createVersion, getVersion } = await import('@/lib/docs/versions-repo')
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'snapshot' }] }],
    }
    const { id } = await createVersion(docId, {
      kind: 'named',
      label: 'full snapshot',
      content,
      markdown: 'snapshot\n',
      authorId: ownerId,
    })
    const v = await getVersion(id, docId)
    expect(v).not.toBeNull()
    expect(v?.content).toEqual(content)
    expect(v?.markdown).toBe('snapshot\n')
    expect(v?.label).toBe('full snapshot')
  })

  it('getVersion returns null for unknown id', async () => {
    const { getVersion } = await import('@/lib/docs/versions-repo')
    const v = await getVersion('00000000-0000-0000-0000-000000000000', docId)
    expect(v).toBeNull()
  })

  it('pruneAutosaves keeps only N newest autosaves', async () => {
    const { createVersion, pruneAutosaves, listVersions } = await import('@/lib/docs/versions-repo')

    // Create a fresh document for this test to avoid interference
    const c2 = new Client({ connectionString: container.getConnectionUri() })
    await c2.connect()
    const { rows } = await c2.query<{ id: string }>(
      `INSERT INTO documents (title, owner_id, markdown) VALUES ('Prune Doc', $1, '') RETURNING id`,
      [ownerId],
    )
    const pruneDocId = rows[0]?.id ?? ''
    await c2.end()

    // Create 5 autosaves + 1 named
    for (let i = 0; i < 5; i++) {
      await createVersion(pruneDocId, { kind: 'auto', content: {}, markdown: `auto ${i}\n` })
    }
    await createVersion(pruneDocId, {
      kind: 'named',
      label: 'keep me',
      content: {},
      markdown: 'named\n',
    })

    // Prune keeping 3 autosaves
    await pruneAutosaves(pruneDocId, 3)

    const remaining = await listVersions(pruneDocId)
    const autos = remaining.filter((v) => v.kind === 'auto')
    const named = remaining.filter((v) => v.kind === 'named')

    // Only 3 autosaves remain
    expect(autos.length).toBe(3)
    // Named snapshots are not pruned
    expect(named.length).toBe(1)
  })

  it('restore path: createVersion then saveDocument, verify doc content updated', async () => {
    const { createVersion, getVersion } = await import('@/lib/docs/versions-repo')
    const { saveDocument, getDocument } = await import('@/lib/docs/repo')

    const snapContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'restored content' }] }],
    }
    const { id: versionId } = await createVersion(docId, {
      kind: 'named',
      label: 'restore target',
      content: snapContent,
      markdown: 'restored content\n',
    })

    const version = await getVersion(versionId, docId)
    expect(version).not.toBeNull()

    // Simulate restore: write version content back to document
    await saveDocument(docId, {
      contentJson: version?.content,
      markdown: version?.markdown ?? '',
    })

    const doc = await getDocument(docId)
    expect(doc?.content).toEqual(snapContent)
    expect(doc?.markdown).toBe('restored content\n')
  })
})
