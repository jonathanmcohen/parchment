import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// J8-3: a docs:read-scoped PAT can READ but CANNOT WRITE anywhere on the API
// surface (not just /api/docs). A docs:write PAT can do both (implication). A cookie
// session is full-access regardless of scope. 403 (not 404) for a known principal
// lacking the scope.

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')

let ownerId = ''
let readToken = ''
let writeToken = ''
let sessionToken = ''

function req(token: string, urlPath: string, method = 'GET', body?: unknown): NextRequest {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(`http://x${urlPath}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  })
}
function cookieReq(urlPath: string, method = 'GET', body?: unknown): NextRequest {
  const headers: Record<string, string> = { cookie: `parchment_session=${sessionToken}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(`http://x${urlPath}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
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
    "INSERT INTO users (email, name, role) VALUES ('scope@p.local','Scope User','owner') RETURNING id",
  )
  ownerId = r.rows[0]!.id
  await c.end()
  process.env.DATABASE_URL = url

  const { issuePat } = await import('@/lib/auth/pat')
  readToken = (await issuePat(ownerId, 'read', ['docs:read'])).token
  writeToken = (await issuePat(ownerId, 'write', ['docs:write'])).token

  // Insert a session row directly (createSession needs a request/cookie scope which a
  // node test lacks). getUserByToken hashes the cookie value with sha256 and looks up
  // by token_hash — so store sha256(rawToken) and send the raw token in the cookie.
  const { createHash } = await import('node:crypto')
  sessionToken = 'sess_' + Math.random().toString(36).slice(2)
  const tokenHash = createHash('sha256').update(sessionToken).digest('hex')
  const { db, schema } = await import('@/db')
  await db.insert(schema.sessions).values({
    userId: ownerId,
    tokenHash,
    expiresAt: new Date(Date.now() + 86_400_000),
    mfaPending: false,
  })
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('J8-3 — scope enforcement across the mutating surface', () => {
  it('docs:read → 200 on GET /api/docs (list)', async () => {
    const { GET } = await import('@/app/api/docs/route')
    expect((await GET(req(readToken, '/api/docs'))).status).toBe(200)
  })

  // The REST doc-create surface is /api/docs/from-template (blank docs are created via
  // a cookie-only server action, not a PAT-reachable REST POST).
  it('docs:read → 403 on POST /api/docs/from-template (create)', async () => {
    const { POST } = await import('@/app/api/docs/from-template/route')
    const res = await POST(req(readToken, '/api/docs/from-template', 'POST', {}))
    expect(res.status).toBe(403)
  })

  it('docs:write → not-403 on POST /api/docs/from-template', async () => {
    const { POST } = await import('@/app/api/docs/from-template/route')
    const res = await POST(req(writeToken, '/api/docs/from-template', 'POST', {}))
    // 201 on a valid create, or a 4xx for a bad/empty body — but NEVER 403 (scope ok).
    expect(res.status).not.toBe(403)
  })

  it('docs:read → 403 on bulk-trash (POST /api/docs/bulk)', async () => {
    const { POST } = await import('@/app/api/docs/bulk/route')
    const res = await POST(req(readToken, '/api/docs/bulk', 'POST', { ids: [], action: 'trash' }))
    expect(res.status).toBe(403)
  })

  it('docs:read → 403 on POST /api/folders', async () => {
    const { POST } = await import('@/app/api/folders/route')
    const res = await POST(req(readToken, '/api/folders', 'POST', { name: 'F' }))
    expect(res.status).toBe(403)
  })

  it('docs:write → allowed on POST /api/folders (201)', async () => {
    const { POST } = await import('@/app/api/folders/route')
    const res = await POST(req(writeToken, '/api/folders', 'POST', { name: 'F' }))
    expect(res.status).toBe(201)
  })

  it('docs:read → 403 on POST /api/tags', async () => {
    const { POST } = await import('@/app/api/tags/route')
    const res = await POST(req(readToken, '/api/tags', 'POST', { name: 'T' }))
    expect(res.status).toBe(403)
  })

  it('docs:read → 403 on POST /api/backup/restore', async () => {
    const { POST } = await import('@/app/api/backup/restore/route')
    const res = await POST(req(readToken, '/api/backup/restore', 'POST', {}))
    expect(res.status).toBe(403)
  })

  it('docs:read → 403 on PUT /api/settings/profile', async () => {
    const { PUT } = await import('@/app/api/settings/profile/route')
    const res = await PUT(req(readToken, '/api/settings/profile', 'PUT', { name: 'New' }))
    expect(res.status).toBe(403)
  })

  it('GET /api/search requires docs:read → read token 200', async () => {
    const { GET } = await import('@/app/api/search/route')
    expect((await GET(req(readToken, '/api/search?q=hello'))).status).toBe(200)
  })

  // ── cookie session is full-access regardless of scope ──
  it('cookie session → allowed on POST /api/folders (no scope needed)', async () => {
    const { POST } = await import('@/app/api/folders/route')
    const res = await POST(cookieReq('/api/folders', 'POST', { name: 'CF' }))
    expect(res.status).toBe(201)
  })

  it('cookie session → allowed on PUT /api/settings/profile', async () => {
    const { PUT } = await import('@/app/api/settings/profile/route')
    const res = await PUT(cookieReq('/api/settings/profile', 'PUT', { name: 'CookieName' }))
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })
})
