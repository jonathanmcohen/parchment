import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// J1-4 / J1-5: asset upload + serve routes against real Postgres.
// Validates: 401 unauth, 404 not-owner, 400 bad type, 201 success returns a URL;
// GET path-traversal blocked, owner 200, share-token 200, random token 404,
// shared editor can upload, shared viewer cannot.

let container: StartedPostgreSqlContainer
let filesRoot: string
const migrationsDir = path.resolve('src/db/migrations')

let ownerId = ''
let editorId = ''
let viewerId = ''
let strangerId = ''
let docId = ''
let ownerToken = ''
let editorToken = ''
let viewerToken = ''
let strangerToken = ''
let shareToken = ''

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

function uploadReq(token: string | null, body: BodyInit | null): NextRequest {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest(`http://x/api/docs/${docId}/assets`, { method: 'POST', headers, body })
}

function pngForm(): FormData {
  const fd = new FormData()
  fd.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
  return fd
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  filesRoot = await mkdtemp(path.join(tmpdir(), 'parchment-asset-it-'))
  process.env.PARCHMENT_FILES_ROOT = filesRoot

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const mkUser = async (email: string, role: string) => {
    const r = await c.query<{ id: string }>(
      'INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id',
      [email, email.split('@')[0], role],
    )
    return r.rows[0]!.id
  }
  ownerId = await mkUser('aowner@p.local', 'owner')
  editorId = await mkUser('aeditor@p.local', 'editor')
  viewerId = await mkUser('aviewer@p.local', 'editor')
  strangerId = await mkUser('astranger@p.local', 'editor')

  const r = await c.query<{ id: string }>(
    "INSERT INTO documents (title, owner_id, markdown) VALUES ('Asset Doc',$1,'x') RETURNING id",
    [ownerId],
  )
  docId = r.rows[0]!.id
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'editor',$3)",
    [docId, editorId, ownerId],
  )
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'viewer',$3)",
    [docId, viewerId, ownerId],
  )

  await c.end()
  process.env.DATABASE_URL = url

  const { issuePat } = await import('@/lib/auth/pat')
  // J8: API PATs need an explicit scope. Upload is a write; viewer/stranger get write
  // too so the 404 (authz) path is proven independent of the scope (403) path.
  ownerToken = (await issuePat(ownerId, 'o', ['docs:write'])).token
  editorToken = (await issuePat(editorId, 'e', ['docs:write'])).token
  viewerToken = (await issuePat(viewerId, 'v', ['docs:write'])).token
  strangerToken = (await issuePat(strangerId, 's', ['docs:write'])).token

  // create a public (view) share for the doc
  const { createShare } = await import('@/lib/docs/shares-repo')
  const share = await createShare(ownerId, docId, { permission: 'view' })
  shareToken = share.token
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
  await rm(filesRoot, { recursive: true, force: true })
})

describe('J1-4 — POST /api/docs/[id]/assets', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(null, pngForm()), { params: Promise.resolve({ id: docId }) })
    expect(res.status).toBe(401)
  })

  it('404 when the caller is neither owner nor a shared editor', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(strangerToken, pngForm()), {
      params: Promise.resolve({ id: docId }),
    })
    expect(res.status).toBe(404)
  })

  it('404 when a shared VIEWER (not editor) tries to upload', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(viewerToken, pngForm()), {
      params: Promise.resolve({ id: docId }),
    })
    expect(res.status).toBe(404)
  })

  it('400 for a disallowed content type', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const fd = new FormData()
    fd.append(
      'file',
      new File([Buffer.from([0x4d, 0x5a])], 'a.exe', { type: 'application/x-msdownload' }),
    )
    const res = await POST(uploadReq(ownerToken, fd), { params: Promise.resolve({ id: docId }) })
    expect(res.status).toBe(400)
  })

  it('400 for an SVG carrying a <script> payload', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const fd = new FormData()
    fd.append(
      'file',
      new File([Buffer.from('<svg><script>alert(1)</script></svg>')], 'x.svg', {
        type: 'image/svg+xml',
      }),
    )
    const res = await POST(uploadReq(ownerToken, fd), { params: Promise.resolve({ id: docId }) })
    expect(res.status).toBe(400)
  })

  it('201 success returns a URL under /api/docs/<id>/assets/ (owner)', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(ownerToken, pngForm()), {
      params: Promise.resolve({ id: docId }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { url: string; kind: string }
    expect(body.url).toMatch(new RegExp(`^/api/docs/${docId}/assets/`))
    expect(body.kind).toBe('image')
  })

  it('201 success for a shared EDITOR', async () => {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(editorToken, pngForm()), {
      params: Promise.resolve({ id: docId }),
    })
    expect(res.status).toBe(201)
  })
})

describe('J1-5 — GET /api/docs/[id]/assets/[file]', () => {
  async function uploadAndGetName(): Promise<string> {
    const { POST } = await import('@/app/api/docs/[id]/assets/route')
    const res = await POST(uploadReq(ownerToken, pngForm()), {
      params: Promise.resolve({ id: docId }),
    })
    const { url } = (await res.json()) as { url: string }
    return url.split('/').at(-1)!
  }

  function getReq(token: string | null, file: string, share?: string): NextRequest {
    const headers: Record<string, string> = {}
    if (token) headers.authorization = `Bearer ${token}`
    const q = share ? `?token=${share}` : ''
    return new NextRequest(`http://x/api/docs/${docId}/assets/${file}${q}`, { headers })
  }

  it('blocks path traversal in the filename', async () => {
    const { GET } = await import('@/app/api/docs/[id]/assets/[file]/route')
    const res = await GET(getReq(ownerToken, '..%2f..%2fpasswd'), {
      params: Promise.resolve({ id: docId, file: '../../passwd' }),
    })
    expect([400, 404]).toContain(res.status)
  })

  it('owner GET 200 with the right content type', async () => {
    const name = await uploadAndGetName()
    const { GET } = await import('@/app/api/docs/[id]/assets/[file]/route')
    const res = await GET(getReq(ownerToken, name), {
      params: Promise.resolve({ id: docId, file: name }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('share-token GET 200 (viewer canView via getDocAccess)', async () => {
    const name = await uploadAndGetName()
    const { GET } = await import('@/app/api/docs/[id]/assets/[file]/route')
    const res = await GET(getReq(null, name, shareToken), {
      params: Promise.resolve({ id: docId, file: name }),
    })
    expect(res.status).toBe(200)
  })

  it('random/unknown share token → 404 (no access, no existence leak)', async () => {
    const name = await uploadAndGetName()
    const { GET } = await import('@/app/api/docs/[id]/assets/[file]/route')
    const res = await GET(getReq(null, name, 'pst_does_not_exist'), {
      params: Promise.resolve({ id: docId, file: name }),
    })
    expect(res.status).toBe(404)
  })

  it('no auth + no token → 401', async () => {
    const name = await uploadAndGetName()
    const { GET } = await import('@/app/api/docs/[id]/assets/[file]/route')
    const res = await GET(getReq(null, name), {
      params: Promise.resolve({ id: docId, file: name }),
    })
    expect(res.status).toBe(401)
  })
})
