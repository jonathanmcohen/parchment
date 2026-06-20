// F2: chokidar watcher — the event source that drives reverse sync. Server-only
// (node:fs + chokidar). Never import into a client component.
//
// The watcher is intentionally thin: every 'add'/'change' event is forwarded to
// handleExternalChange, which owns all classification and best-effort handling.
// Setup is wrapped so a missing/unwritable files root never crashes the server.

import { watch } from 'chokidar'
import { handleExternalChange } from './reverse-sync'

/** Read the files root at call time so config/env changes are honored. */
function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

// Module-level idempotency guard: start at most once per process.
let started = false

/**
 * Start the chokidar watcher once (idempotent). No-op if already started or if
 * watcher setup fails (e.g. files root unwritable). NEVER throws.
 */
export async function startDiskWatcher(): Promise<void> {
  if (started) return
  try {
    const root = filesRoot()
    const watcher = watch(root, {
      ignoreInitial: true,
      // Ignore dotfiles/dot-dirs and `.assets` trees; let reverse-sync do the
      // finer-grained .md / conflict-sibling filtering.
      ignored: [/(^|[/\\])\../, /\.assets/],
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    // Fire-and-forget: handleExternalChange is best-effort and never throws.
    watcher.on('add', (absPath) => void handleExternalChange(absPath))
    watcher.on('change', (absPath) => void handleExternalChange(absPath))
    // v0.1: do NOT delete docs when their file is removed (noted as a gap).
    watcher.on('unlink', (absPath) => {
      console.warn(`[parchment-disk] file removed (not deleting doc): ${absPath}`)
    })
    // A watcher 'error' must not crash the process.
    watcher.on('error', (err) => {
      console.error('[parchment-disk] watcher error:', err)
    })

    // Mark started only after the watch is attached.
    started = true
    console.log(`[parchment-disk] reverse-sync watcher started on ${root}`)
  } catch (err) {
    console.error('[parchment-disk] failed to start watcher:', err)
  }
}
