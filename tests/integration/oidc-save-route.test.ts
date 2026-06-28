// Task 3.1 — PUT /api/settings/sso gate + audit. A non-admin save is rejected (403);
// an admin save validates the issuer via discovery (against the stub) and audits
// 'oidc.config' with NO secret in meta. The secret is never echoed in the response.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { StubOidcProvider } from './helpers/stub-oidc'

let ACTOR: { id: string; role: string } | null = null
vi.mock('@/lib/auth/guard', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guard')>()
  return { ...actual, authenticateRequest: async () => ACTOR }
})

let container: StartedPostgreSqlContainer
let url: string
let stub: StubOidcProvider
let OWNER_ID = ''
const migrationsDir = path.resolve('src/db/migrations')
const CLIENT_ID = 'save-route-client'
const CLIENT_SECRET = 'save-route-secret'

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  url = container.getConnectionUri()
  const c = await client()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const u = await c.query<{ id: string }>(
    "insert into users (email, name, role) values ('owner@p.local','O','owner') returning id",
  )
  OWNER_ID = u.rows[0]?.id as string
  await c.end()
  process.env.DATABASE_URL = url

  stub = new StubOidcProvider()
  stub.setClient(CLIENT_ID, CLIENT_SECRET)
  await stub.start()
}, 180_000)

afterAll(async () => {
  await stub?.stop()
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

function putReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/settings/sso', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.5' },
    body: JSON.stringify(body),
  })
}

describe('Task 3.1 — PUT /api/settings/sso', () => {
  it('rejects a non-admin (editor) with 403', async () => {
    ACTOR = { id: 'someone', role: 'editor' }
    const { PUT } = await import('@/app/api/settings/sso/route')
    const res = await PUT(putReq({ enabled: false, issuerUrl: '', clientId: '' }))
    expect(res.status).toBe(403)
  })

  it('rejects an unauthenticated request with 401', async () => {
    ACTOR = null
    const { PUT } = await import('@/app/api/settings/sso/route')
    const res = await PUT(putReq({ enabled: false, issuerUrl: '', clientId: '' }))
    expect(res.status).toBe(401)
  })

  it('admin save validates the issuer via discovery, audits oidc.config (no secret), masks the response', async () => {
    ACTOR = { id: OWNER_ID, role: 'owner' }
    const { PUT } = await import('@/app/api/settings/sso/route')
    const res = await PUT(
      putReq({
        enabled: true,
        issuerUrl: stub.issuer,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        scopes: 'openid email profile',
      }),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { clientSecret: string }
    // The response never contains the plaintext secret — only the mask.
    expect(json.clientSecret).toBe('••••••••')
    expect(JSON.stringify(json)).not.toContain(CLIENT_SECRET)

    const c = await client()
    const audit = await c.query<{ action: string; meta: Record<string, unknown> | null }>(
      "select action, meta from audit_log where action='oidc.config' order by created_at desc limit 1",
    )
    await c.end()
    expect(audit.rows[0]?.action).toBe('oidc.config')
    // No secret in the audit meta.
    expect(JSON.stringify(audit.rows[0]?.meta ?? {})).not.toContain(CLIENT_SECRET)

    const { verifyAuditChain } = await import('@/lib/audit')
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('admin save with a bad issuer (discovery fails) returns 400', async () => {
    ACTOR = { id: OWNER_ID, role: 'owner' }
    const { PUT } = await import('@/app/api/settings/sso/route')
    const res = await PUT(
      putReq({
        enabled: true,
        issuerUrl: 'http://127.0.0.1:1/does-not-exist',
        clientId: CLIENT_ID,
        clientSecret: 'x',
      }),
    )
    expect(res.status).toBe(400)
  })
})
