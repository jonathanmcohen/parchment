// F2: chokidar watcher — the event source that drives reverse sync. Server-only
// (node:fs + chokidar). Never import into a client component.
//
// The watcher is intentionally thin: every 'add'/'change' event is forwarded to
// handleExternalChange, which owns all classification and best-effort handling.
// Setup is wrapped so a missing/unwritable files root never crashes the server.
//
// F4: the watcher is ALSO the single git committer. Every settled .md change is
// autocommitted (commitPath) and every unlink is removeAndCommit'd, in addition
// to the reverse-sync classification (which is independent — even a forward-
// mirror 'echo' write must be committed). The git module is pure JS
// (isomorphic-git), so importing it here keeps the watcher editor-graph-free.
// All git ops are best-effort and serialized inside the git module; the watcher
// fires them and-forgets.

import { isAbsolute, relative, sep } from 'node:path'
import { watch } from 'chokidar'
import { commitPath, ensureRepo, removeAndCommit } from '@/lib/git/repo'
import { handleExternalChange } from './reverse-sync'

/** Read the files root at call time so config/env changes are honored. */
function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

/**
 * POSIX-style relPath under filesRoot when `absFilePath` is a committable managed
 * file (a real `.md`, no dotfiles/dot-dirs, no `.assets`, no `*.conflict-*.md`
 * sibling), else null. Mirrors reverse-sync's `relPathIfManaged` but kept local
 * so the watcher pulls in no extra graph. Pure path math — never throws.
 */
function committableRelPath(absFilePath: string): string | null {
  if (!isAbsolute(absFilePath)) return null
  const root = filesRoot()
  const rel = relative(root, absFilePath)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  const segments = rel.split(sep)
  if (segments.some((s) => s.startsWith('.') || s === '.assets' || s.endsWith('.assets'))) {
    return null
  }
  const base = segments[segments.length - 1] ?? ''
  if (!base.endsWith('.md')) return null
  if (/\.conflict-\d+\.md$/.test(base)) return null
  return segments.join('/')
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

    // F4: ensure the git repo exists before the first commit (best-effort —
    // never throws). Fire-and-forget: a slow/failing init must not block the
    // watcher from attaching, and the git module's queue serializes the init
    // ahead of any commit it later enqueues.
    void ensureRepo()

    const watcher = watch(root, {
      ignoreInitial: true,
      // Ignore dotfiles/dot-dirs and `.assets` trees; let reverse-sync do the
      // finer-grained .md / conflict-sibling filtering.
      ignored: [/(^|[/\\])\../, /\.assets/],
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    // Fire-and-forget: handleExternalChange is best-effort and never throws.
    // F4: autocommit independently of reverse-sync classification — even a
    // forward-mirror 'echo' write is a real file change that belongs in history.
    // Order between the two is irrelevant; both are best-effort. The git module's
    // queue serializes concurrent commits so the index can't race.
    const onAddOrChange = (absPath: string): void => {
      const rel = committableRelPath(absPath)
      if (rel !== null) void commitPath(rel, `edit: ${rel}`)
      void handleExternalChange(absPath)
    }
    watcher.on('add', onAddOrChange)
    watcher.on('change', onAddOrChange)
    // v0.1: do NOT delete docs when their file is removed (noted as a gap), but
    // DO record the deletion in git history (remove + commit, best-effort).
    watcher.on('unlink', (absPath) => {
      const rel = committableRelPath(absPath)
      if (rel !== null) void removeAndCommit(rel, `delete: ${rel}`)
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
