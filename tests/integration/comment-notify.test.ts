import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// H Task 11 — @mention → notification via Group B's sendNotification (MOCKED).
// notifyMentions resolves mentions → users by NAME, de-dups, drops the author (no
// self-notify), drops unknown mentions, and dispatches non-blocking + best-effort.

let container: StartedPostgreSqlContainer
let aliceId: string
let bobId: string
let docId: string
const migrationsDir = path.resolve('src/db/migrations')

// Spy installed via vi.mock below; reset per test.
type NotifyArg = { userId: string; subject: string; text: string; html?: string }
const sendSpy = vi.fn(async (_p: NotifyArg) => ({ ok: true as const }))
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (p: NotifyArg) => sendSpy(p),
}))

/** Let the fire-and-forget notifyMentions IIFE settle. */
async function flush() {
  await new Promise((r) => setTimeout(r, 50))
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  process.env.DATABASE_URL = container.getConnectionUri()

  const c = new Client({ connectionString: container.getConnectionUri() })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const alice = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('alice@p.local','alice','owner') RETURNING id",
  )
  aliceId = alice.rows[0]?.id ?? ''
  const bob = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('bob@p.local','bob','editor') RETURNING id",
  )
  bobId = bob.rows[0]?.id ?? ''
  const doc = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Doc', $1, 'hi\n') RETURNING id`,
    [aliceId],
  )
  docId = doc.rows[0]?.id ?? ''
  await c.end()
}, 180_000)

afterEach(() => {
  sendSpy.mockClear()
})

afterAll(async () => {
  await container?.stop()
})

describe('notifyMentions', () => {
  it('mentioning @bob (existing user) calls sendNotification once for bob', async () => {
    const { notifyMentions } = await import('@/lib/docs/comment-notify')
    notifyMentions(docId, aliceId, 'hey @bob look at this', ['bob'])
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const arg = sendSpy.mock.calls[0]?.[0]
    expect(arg).toBeDefined()
    if (!arg) return
    expect(arg.userId).toBe(bobId)
    expect(arg.text).toContain('look at this')
  })

  it('mentioning a NON-existent username sends nothing', async () => {
    const { notifyMentions } = await import('@/lib/docs/comment-notify')
    notifyMentions(docId, aliceId, 'hi @nobody', ['nobody'])
    await flush()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('mentioning the AUTHOR themselves sends nothing (no self-notify)', async () => {
    const { notifyMentions } = await import('@/lib/docs/comment-notify')
    notifyMentions(docId, aliceId, 'note to self @alice', ['alice'])
    await flush()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('de-dupes repeated mentions of the same user', async () => {
    const { notifyMentions } = await import('@/lib/docs/comment-notify')
    notifyMentions(docId, aliceId, '@bob @bob @bob', ['bob', 'bob', 'bob'])
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('an anonymous (null author) mention still notifies the mentioned user', async () => {
    const { notifyMentions } = await import('@/lib/docs/comment-notify')
    notifyMentions(docId, null, 'from a share link @bob', ['bob'])
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const arg = sendSpy.mock.calls[0]?.[0]
    expect(arg).toBeDefined()
    if (!arg) return
    expect(arg.userId).toBe(bobId)
  })
})
