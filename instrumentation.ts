// Next 16 runs register() once per server process. It USED to start the F2 disk
// reverse-sync watcher here, but as of F2b the watcher (and the bridge from an
// external .md edit into the live collab Y.Doc) is owned by the collab server
// (collab/server.ts), which runs under tsx where the Tiptap editor graph loads.
//
// The Next turbopack server runtime cannot load that editor graph
// ("Class extends undefined"), so it could update documents.content but NOT the
// collab Y.Doc. So the disk-watcher stays owned by the collab process — we do
// NOT touch the editor graph here.
//
// I10: this is where the in-process scheduler boots. It is ON BY DEFAULT with NO
// env flag — a fresh install runs the scheduled jobs (e.g. trash-purge) with
// zero config. The scheduler module is plain server code (DB only, no editor
// graph), and it is DYNAMICALLY imported so its `@/db` import is only pulled on
// the nodejs runtime (never the edge runtime or the client). `scheduler.start()`
// is idempotent, and the whole thing is wrapped in try/catch so a scheduler
// failure can never crash server boot.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    await scheduler.start()
  } catch {
    // A scheduler failure must never crash boot — the app still serves.
  }
}
