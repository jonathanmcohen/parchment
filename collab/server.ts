import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import { Pool } from 'pg'

// Hocuspocus collab server — own process, same container as Next (single-image deploy).
// v0.1: persists Yjs document state to Postgres. Auth bridge (PAT) lands in A2/D.

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://parchment:parchment@localhost:5432/parchment',
})

const port = Number(process.env.COLLAB_PORT ?? '1234')

const server = new Server({
  port,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const { rows } = await pool.query<{ state: Buffer }>(
          'select state from collab_state where name = $1',
          [documentName],
        )
        return rows[0]?.state ?? null
      },
      store: async ({ documentName, state }) => {
        // `state` is a Uint8Array; wrap in a Buffer so node-postgres binds it as
        // a bytea param (a raw Uint8Array would be sent as text and rejected with
        // "invalid byte sequence for encoding").
        await pool.query(
          `insert into collab_state (name, state, updated_at)
           values ($1, $2, now())
           on conflict (name) do update set state = excluded.state, updated_at = now()`,
          [documentName, Buffer.from(state)],
        )
      },
    }),
  ],
  onListen: async ({ port: p }) => {
    // eslint-disable-next-line no-console
    console.log(`[parchment-collab] listening on :${p}`)
  },
})

server.listen()
