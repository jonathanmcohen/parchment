import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import { getSchema } from '@tiptap/core'
import { Pool } from 'pg'
import { updateYFragment } from 'y-prosemirror'
import { setApplyToYDoc } from '../src/lib/disk/reverse-sync'
import { startDiskWatcher } from '../src/lib/disk/watcher'
import { baseExtensions } from '../src/lib/editor/tiptap-extensions'

// Hocuspocus collab server — own process, same container as Next (single-image deploy).
// v0.1: persists Yjs document state to Postgres. Auth bridge (PAT) lands in A2/D.
//
// F2b: this process ALSO owns the disk reverse-sync watcher and the bridge from
// an external .md edit into the live collab Y.Doc. The bridge needs the
// ProseMirror schema + y-prosemirror.updateYFragment — i.e. the Tiptap editor
// extension graph. That graph throws "Class extends undefined" under the Next
// turbopack server runtime (which is why src/lib/markdown/parse.ts is hand-rolled
// and graph-free), but it loads fine here under tsx. So the watcher + Y.Doc
// bridge live HERE, the one long-lived process that already owns the Y.Docs.
// Imports use RELATIVE paths (../src/...) because the '@/' alias is not resolved
// by the bare-tsx collab runtime. Every bridge op is best-effort: a failure must
// never crash the collab server or undo the DB reverse-sync.

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

// F2b — disk reverse-sync → collab Y.Doc bridge.
//
// Build the ProseMirror schema ONCE from the same baseExtensions the editor uses
// so an applied node matches the editor's schema exactly (the collab document
// name === the doc id, and the editor binds field 'default').
const schema = getSchema(baseExtensions)

// Inject the apply function into reverse-sync. After reverse-sync commits an
// external edit to the DB, it calls this with the doc id + parsed PM JSON; we
// open a direct connection to that doc's Y.Doc and replace its content via
// updateYFragment (which diffs the new PM node against the existing fragment and
// applies MINIMAL Y ops in place — a replace, never an append). Hocuspocus
// loads the doc from collab_state if not already in memory, persists the result
// via the Database `store`, and broadcasts the delta to connected clients.
setApplyToYDoc(async (docId, json) => {
  const conn = await server.hocuspocus.openDirectConnection(docId)
  try {
    await conn.transact((document) => {
      // Hocuspocus `Document` extends Yjs `Doc`, so it IS the Y.Doc — the editor
      // binds the 'default' XmlFragment (Editor.tsx FIELD = 'default').
      const fragment = document.getXmlFragment('default')
      const pmNode = schema.nodeFromJSON(json)
      // 4th arg is y-prosemirror's BindingMetadata (NOT a bare Map): verified
      // against y-prosemirror@1.3.7 sync-plugin.d.ts — `createEmptyMeta()` returns
      // `{ mapping, isOMark }`, and the function reads both. A bare `new Map()`
      // would be a type error and crash at `meta.isOMark`.
      updateYFragment(document, fragment, pmNode, { mapping: new Map(), isOMark: new Map() })
    })
  } finally {
    // Always release the direct connection, even if transact threw, so a single
    // bad doc can never leak a connection or wedge the watcher. The reverse-sync
    // try/catch around this call swallows the throw best-effort.
    await conn.disconnect()
  }
})

server.listen()

// Start the disk reverse-sync watcher in THIS process (the Next process no
// longer does — see instrumentation.ts). startDiskWatcher is idempotent and
// never throws; the bridge above is already wired so the first external edit can
// reach the Y.Doc immediately.
void startDiskWatcher().then(() => {
  // eslint-disable-next-line no-console
  console.log('[parchment-collab] disk reverse-sync watcher started')
})
