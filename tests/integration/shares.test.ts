import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// G1: share repo — createShare / resolveShare / listShares / revokeShare /
// verifySharePassword / expiry against real Postgres via Testcontainers.

let container: StartedPostgreSqlContainer
let ownerId: string
let otherId: string
let docId: string
let otherDocId: string
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

  // Seed two users (owner-scoping checks) + a doc for each.
  const owner = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('owner@p.local','Owner','owner') RETURNING id",
  )
  ownerId = owner.rows[0]?.id ?? ''
  const other = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('other@p.local','Other','owner') RETURNING id",
  )
  otherId = other.rows[0]?.id ?? ''

  const doc = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Shared Doc', $1, 'hello\n') RETURNING id`,
    [ownerId],
  )
  docId = doc.rows[0]?.id ?? ''
  const otherDoc = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Other Doc', $1, 'nope\n') RETURNING id`,
    [otherId],
  )
  otherDocId = otherDoc.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('G1 — shares repo', () => {
  it('createShare returns id + a 32-byte base64url token, resolvable by token', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const { id, token } = await createShare(ownerId, docId, { permission: 'view' })
    expect(id).toBeTruthy()

    // base64url of 32 bytes → 43 chars (no padding), URL-safe alphabet only.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(token, 'base64url').length).toBe(32)

    const share = await resolveShare(token)
    expect(share).not.toBeNull()
    expect(share?.docId).toBe(docId)
    expect(share?.ownerId).toBe(ownerId)
    expect(share?.permission).toBe('view')
    expect(share?.passwordHash).toBeNull()
  })

  it('generates unique tokens across shares', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const a = await createShare(ownerId, docId, { permission: 'view' })
    const b = await createShare(ownerId, docId, { permission: 'edit' })
    expect(a.token).not.toBe(b.token)
  })

  it('listShares is owner-scoped: a second owner cannot see this doc’s shares', async () => {
    const { createShare, listShares } = await import('@/lib/docs/shares-repo')
    await createShare(ownerId, docId, { permission: 'comment' })

    const mine = await listShares(ownerId, docId)
    expect(mine.length).toBeGreaterThan(0)
    for (const s of mine) expect(s.ownerId).toBe(ownerId)

    // A different user asking for the same doc gets nothing (not their share).
    const theirs = await listShares(otherId, docId)
    expect(theirs).toEqual([])
  })

  it('resolveShare returns null for an unknown token', async () => {
    const { resolveShare } = await import('@/lib/docs/shares-repo')
    expect(await resolveShare('definitely-not-a-real-token')).toBeNull()
    expect(await resolveShare('')).toBeNull()
  })

  it('revokeShare (owner-scoped) deletes the share → resolveShare returns null', async () => {
    const { createShare, resolveShare, revokeShare } = await import('@/lib/docs/shares-repo')
    const { id, token } = await createShare(ownerId, docId, { permission: 'view' })
    expect(await resolveShare(token)).not.toBeNull()

    await revokeShare(ownerId, id)
    expect(await resolveShare(token)).toBeNull()
  })

  it('revokeShare does NOT delete another owner’s share', async () => {
    const { createShare, resolveShare, revokeShare } = await import('@/lib/docs/shares-repo')
    const { id, token } = await createShare(otherId, otherDocId, { permission: 'view' })

    // The wrong owner cannot revoke it.
    await revokeShare(ownerId, id)
    expect(await resolveShare(token)).not.toBeNull()

    // The real owner can.
    await revokeShare(otherId, id)
    expect(await resolveShare(token)).toBeNull()
  })

  it('expiry: a share whose expiresAt is in the past resolves to null', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const past = new Date(Date.now() - 60_000)
    const { token } = await createShare(ownerId, docId, { permission: 'view', expiresAt: past })
    expect(await resolveShare(token)).toBeNull()
  })

  it('expiry: a future expiresAt still resolves', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const future = new Date(Date.now() + 60 * 60_000)
    const { token } = await createShare(ownerId, docId, { permission: 'view', expiresAt: future })
    const share = await resolveShare(token)
    expect(share).not.toBeNull()
    expect(share?.expiresAt).not.toBeNull()
  })

  it('password: correct verifies true, wrong false, none-set always true', async () => {
    const { createShare, resolveShare, verifySharePassword } = await import(
      '@/lib/docs/shares-repo'
    )

    // Password-protected share.
    const { token } = await createShare(ownerId, docId, {
      permission: 'view',
      password: 'correct horse battery staple',
    })
    const share = await resolveShare(token)
    expect(share).not.toBeNull()
    expect(share?.passwordHash).not.toBeNull()
    if (!share) throw new Error('share missing')

    expect(await verifySharePassword(share, 'correct horse battery staple')).toBe(true)
    expect(await verifySharePassword(share, 'wrong')).toBe(false)
    expect(await verifySharePassword(share, '')).toBe(false)
    expect(await verifySharePassword(share, null)).toBe(false)

    // No-password share → any supplied value (incl. null) verifies true.
    const open = await createShare(ownerId, docId, { permission: 'view' })
    const openShare = await resolveShare(open.token)
    if (!openShare) throw new Error('open share missing')
    expect(await verifySharePassword(openShare, null)).toBe(true)
    expect(await verifySharePassword(openShare, 'anything')).toBe(true)
  })

  it('trashing a shared doc revokes its shares → resolveShare returns null', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const { trashDocument } = await import('@/lib/docs/repo')
    const c = new Client({ connectionString: container.getConnectionUri() })
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO documents (title, owner_id, markdown) VALUES ('Trash Me', $1, 'secret\n') RETURNING id`,
      [ownerId],
    )
    const trashDocId = rows[0]?.id ?? ''
    await c.end()

    const { token } = await createShare(ownerId, trashDocId, { permission: 'view' })
    expect(await resolveShare(token)).not.toBeNull()

    // The owner's "take it down" gesture must revoke the link (soft delete does
    // NOT fire the FK cascade, so trashDocument deletes the shares directly).
    await trashDocument(ownerId, trashDocId)
    expect(await resolveShare(token)).toBeNull()
  })

  it('FK cascade: deleting the doc removes its shares', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const c = new Client({ connectionString: container.getConnectionUri() })
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO documents (title, owner_id, markdown) VALUES ('Ephemeral', $1, '') RETURNING id`,
      [ownerId],
    )
    const ephemeralDocId = rows[0]?.id ?? ''
    const { token } = await createShare(ownerId, ephemeralDocId, { permission: 'view' })
    expect(await resolveShare(token)).not.toBeNull()

    await c.query('DELETE FROM documents WHERE id = $1', [ephemeralDocId])
    await c.end()

    expect(await resolveShare(token)).toBeNull()
  })
})
