import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// J6-2: structured operators wired into GET /api/search. A PAT (docs:read) is the
// principal so the route's auth + scope path is exercised end-to-end. Asserts the
// route resolves tag:/folder:/is:starred names→ids and feeds the residual text to
// FTS. Also J4-3: searchFullText orders by ts_rank desc. Embeddings are NEVER
// required (mode defaults to keyword; semantic stays unconfigured here).

let container: StartedPostgreSqlContainer
let ownerId = ''
let readToken = ''
let tagId = ''
let folderId = ''
const migrationsDir = path.resolve('src/db/migrations')

function req(token: string, url: string): NextRequest {
  return new NextRequest(`http://x${url}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
}

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
  const r = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('ops@p.local','Ops User','owner') RETURNING id",
  )
  ownerId = r.rows[0]?.id ?? ''
  await c.end()
  process.env.DATABASE_URL = url
  delete process.env.EMBEDDINGS_URL

  const { issuePat } = await import('@/lib/auth/pat')
  readToken = (await issuePat(ownerId, 'read', ['docs:read'])).token

  // Seed: a tag, a folder, and docs.
  const { createTag } = await import('@/lib/docs/tags-repo')
  tagId = (await createTag(ownerId, { name: 'Work', color: 'blue' })).id
  const { createFolder } = await import('@/lib/docs/folders-repo')
  folderId = (await createFolder(ownerId, { name: 'Projects' })).id

  const { createDocument, saveDocument, setStarred } = await import('@/lib/docs/repo')
  const { addTagToDoc } = await import('@/lib/docs/tags-repo')

  const a = await createDocument(ownerId, { title: 'Quarterly report draft' })
  await saveDocument(a.id, {
    contentJson: {},
    markdown: 'report report report quarterly numbers',
    title: 'Quarterly report draft',
  })
  await addTagToDoc(ownerId, a.id, tagId)
  await setStarred(ownerId, a.id, true)

  const b = await createDocument(ownerId, { title: 'Random notes' })
  await saveDocument(b.id, {
    contentJson: {},
    markdown: 'a single report mention here',
    title: 'Random notes',
  })

  const inFolder = await createDocument(ownerId, { title: 'Folder report', folderId })
  await saveDocument(inFolder.id, {
    contentJson: {},
    markdown: 'report inside a folder',
    title: 'Folder report',
  })
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('J6-2 — operators in /api/search', () => {
  it('q="report tag:Work is:starred" → only the starred Work-tagged doc', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(req(readToken, '/api/search?q=report%20tag:Work%20is:starred'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: { title: string }[] }
    const titles = body.results.map((r) => r.title)
    expect(titles).toContain('Quarterly report draft')
    expect(titles).not.toContain('Random notes')
    expect(titles).not.toContain('Folder report')
  })

  it('q="report folder:Projects" → only the doc in Projects', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(req(readToken, '/api/search?q=report%20folder:Projects'))
    const body = (await res.json()) as { results: { title: string }[] }
    const titles = body.results.map((r) => r.title)
    expect(titles).toEqual(['Folder report'])
  })

  it('an unknown tag name yields zero results (no leakage)', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(req(readToken, '/api/search?q=report%20tag:DoesNotExist'))
    const body = (await res.json()) as { results: unknown[] }
    expect(body.results).toHaveLength(0)
  })

  it('title: operator filters by title substring', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(req(readToken, '/api/search?q=report%20title:Quarterly'))
    const body = (await res.json()) as { results: { title: string }[] }
    const titles = body.results.map((r) => r.title)
    expect(titles).toContain('Quarterly report draft')
    expect(titles).not.toContain('Folder report')
  })

  it('J4-3 ranking: searchFullText orders by ts_rank desc', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const rows = await searchFullText(ownerId, 'report')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // The doc with the most 'report' mentions ranks first.
    expect(rows[0]?.title).toBe('Quarterly report draft')
  })

  it('after:/before: date filters never throw and bound the set', async () => {
    const { searchFullText } = await import('@/lib/docs/search-repo')
    const future = await searchFullText(ownerId, 'report', { after: '2999-01-01' })
    expect(future).toHaveLength(0)
    const past = await searchFullText(ownerId, 'report', { after: '2000-01-01' })
    expect(past.length).toBeGreaterThanOrEqual(2)
  })
})
