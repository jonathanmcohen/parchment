import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'

// Seeds an owner + a valid session directly in the e2e DB and writes a Playwright
// storageState carrying the session cookie, so protected (app) routes (gated by
// requireUser) are reachable in the authed a11y project. Mirrors session.ts:
// cookie 'parchment_session' = base64url token; DB stores sha256(token).
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://parchment:parchment@127.0.0.1:5434/parchment'
const STATE = path.resolve('tests/e2e/.auth/state.json')
export const SEEDED_DOC_ID = '00000000-0000-0000-0000-0000000000d0'

export default async function globalSetup(): Promise<void> {
  const c = new Client({ connectionString: DB })
  await c.connect()
  await c.query('truncate table sessions, pats, users restart identity cascade')
  const { rows } = await c.query<{ id: string }>(
    "insert into users (email, name, role) values ('owner@parchment.local', 'Owner', 'owner') returning id",
  )
  const userId = rows[0]?.id
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
  await c.query('insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)', [
    userId,
    tokenHash,
    expiresAt,
  ])

  // Seeded document with a fixed id so the editor route has a stable a11y target.
  await c.query(
    `insert into documents (id, owner_id, title, markdown, content)
     values ($1, $2, 'Seeded doc', $3, $4::jsonb)`,
    [
      SEEDED_DOC_ID,
      userId,
      'Hello\n',
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
      }),
    ],
  )
  await c.end()

  await mkdir(path.dirname(STATE), { recursive: true })
  await writeFile(
    STATE,
    JSON.stringify({
      cookies: [
        {
          name: 'parchment_session',
          value: token,
          domain: 'localhost',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    }),
  )
}
