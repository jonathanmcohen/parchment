// Next 16 runs register() once per server process. It USED to start the F2 disk
// reverse-sync watcher here, but as of F2b the watcher (and the bridge from an
// external .md edit into the live collab Y.Doc) is owned by the collab server
// (collab/server.ts), which runs under tsx where the Tiptap editor graph loads.
//
// The Next turbopack server runtime cannot load that editor graph
// ("Class extends undefined"), so it could update documents.content but NOT the
// collab Y.Doc — making external edits invisible to open editors and shadowed on
// reopen (collab_state wins over documents.content). Running chokidar here too
// would also double-watch the files root. So register() is now a no-op: the
// collab process is the single owner of the watcher.
export async function register(): Promise<void> {
  // Guard kept harmless: nothing to start on any runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
}
