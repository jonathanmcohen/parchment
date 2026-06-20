// F4: per-doc git history via isomorphic-git. Server-only in spirit (node:fs),
// but NO 'server-only' guard so it stays unit/integration-testable and loads in
// BOTH the Next server runtime and the collab tsx runtime. isomorphic-git is
// pure JS (no native deps, no editor graph), so importing this from the disk
// watcher keeps the watcher editor-graph-free.
//
// ONE git repo lives at filesRoot. The disk watcher is the single committer:
// every settled .md change → commitPath; every unlink → removeAndCommit. Per-doc
// history = the commits that touched that doc's disk_path.
//
// BEST-EFFORT THROUGHOUT: a git failure (non-repo dir, permission error,
// corrupt index, unsupported merge) must NEVER throw out of the watcher, the
// mirror, a save, or the server. Every exported op returns a sentinel
// (null / [] / false) on any error and never rejects.

import fs from 'node:fs'
import { join } from 'node:path'
import git from 'isomorphic-git'

/** Fixed author for every autocommit — no real identity is involved. */
const AUTHOR = { name: 'Parchment', email: 'parchment@localhost' } as const

/** git dir = the configured files root, read at call time so env changes (and
 *  per-test PARCHMENT_FILES_ROOT overrides) are honored. */
export function gitDir(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

// ── Write serialization ──────────────────────────────────────────────────────
//
// All WRITE ops (init/commit/remove/branch/merge) run through one module-level
// promise chain so that within this process git never races on the index — two
// concurrent change events can't interleave an `add` and a `commit`. Each op is
// appended with `queue = queue.then(run)`; we keep the chain alive across a
// rejected op by catching on the chain link (the op's OWN result is still what
// the caller awaits). Reads (log / readAtCommit) run OUTSIDE the queue.
let queue: Promise<unknown> = Promise.resolve()

/** Append `op` to the serialized write queue and return its result. The queue
 *  itself never rejects (so one failed op can't poison later ones); the caller
 *  still observes this op's own resolution/rejection via the returned promise. */
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op)
  // Keep the chain alive regardless of this op's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export interface GitCommit {
  oid: string
  message: string
  timestamp: number
  author: string
}

// ── Repo lifecycle ───────────────────────────────────────────────────────────

/**
 * Ensure a git repo exists at filesRoot with a minimal local identity config
 * (idempotent, best-effort). Safe to call on every watcher start. Never throws.
 */
export async function ensureRepo(): Promise<void> {
  try {
    await enqueue(async () => {
      const dir = gitDir()
      // `git.init` is idempotent — it re-creates missing plumbing without
      // discarding existing history. Run it unconditionally so a half-created
      // .git self-heals.
      await git.init({ fs, dir, defaultBranch: 'main' })
      // A local user identity so commits never depend on a global git config
      // (the Next/collab runtimes may have none). Best-effort.
      await git.setConfig({ fs, dir, path: 'user.name', value: AUTHOR.name })
      await git.setConfig({ fs, dir, path: 'user.email', value: AUTHOR.email })
    })
  } catch {
    // best-effort — a repo we couldn't init just means no history is recorded.
  }
}

// ── Write ops (serialized) ───────────────────────────────────────────────────

/**
 * Has `relPath` changed relative to the index/HEAD (i.e. is there something to
 * commit)? Uses statusMatrix for the single file: a row of [head, workdir, stage]
 * where workdir !== head OR stage !== head means staged/unstaged changes exist.
 * Best-effort → treats any error as "no change" so we never emit a bogus commit.
 */
async function hasPendingChange(dir: string, relPath: string): Promise<boolean> {
  try {
    const matrix = await git.statusMatrix({ fs, dir, filepaths: [relPath] })
    for (const row of matrix) {
      const [, head, workdir, stage] = row
      if (workdir !== head || stage !== head) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Stage + commit one file (path relative to filesRoot, POSIX-style). Serialized
 * through the write queue. Skips when the file is unchanged so we never create an
 * empty commit. Best-effort → resolves to the new commit oid, or null on
 * no-change / any error.
 */
export async function commitPath(relPath: string, message: string): Promise<string | null> {
  return enqueue(async () => {
    try {
      const dir = gitDir()
      await git.add({ fs, dir, filepath: relPath })
      // After staging, re-check: if nothing differs from HEAD, skip (no empty
      // commit). statusMatrix compares workdir+stage against HEAD.
      if (!(await hasPendingChange(dir, relPath))) return null
      const oid = await git.commit({ fs, dir, message, author: AUTHOR })
      return oid
    } catch {
      return null
    }
  })
}

/**
 * Stage a deletion of `relPath` + commit. Serialized. Best-effort → oid or null
 * (null also when the path wasn't tracked, so there's nothing to remove).
 */
export async function removeAndCommit(relPath: string, message: string): Promise<string | null> {
  return enqueue(async () => {
    try {
      const dir = gitDir()
      await git.remove({ fs, dir, filepath: relPath })
      if (!(await hasPendingChange(dir, relPath))) return null
      const oid = await git.commit({ fs, dir, message, author: AUTHOR })
      return oid
    } catch {
      return null
    }
  })
}

/**
 * Create a branch at HEAD (best-effort → true on success, false on any error,
 * e.g. the branch already exists or the repo has no commits yet). Serialized.
 */
export async function createBranch(name: string): Promise<boolean> {
  return enqueue(async () => {
    try {
      await git.branch({ fs, dir: gitDir(), ref: name })
      return true
    } catch {
      return false
    }
  })
}

/**
 * Merge branch `from` into the CURRENT branch (best-effort). Serialized.
 *
 * Conflicting merges are REPORTED, not auto-resolved: isomorphic-git throws a
 * MergeConflictError / MergeNotSupportedError when the built-in diff3 driver
 * can't cleanly merge, which we surface as `{ conflict: true }` rather than
 * writing conflict markers or picking a side. On a clean merge we return the
 * resulting oid (the fast-forward target or the new merge commit). Any other
 * error (no such branch, no commits) → null.
 */
export async function mergeBranch(
  from: string,
): Promise<{ oid?: string; conflict?: boolean } | null> {
  return enqueue(async () => {
    try {
      const ours = await git.currentBranch({ fs, dir: gitDir(), fullname: false })
      const result = await git.merge({
        fs,
        dir: gitDir(),
        ...(typeof ours === 'string' ? { ours } : {}),
        theirs: from,
        author: AUTHOR,
      })
      return result.oid !== undefined ? { oid: result.oid } : {}
    } catch (err) {
      // A merge conflict is an expected, reported outcome — not a hard failure.
      const code = (err as { code?: string } | null)?.code
      if (code === 'MergeConflictError' || code === 'MergeNotSupportedError') {
        return { conflict: true }
      }
      return null
    }
  })
}

// ── Read ops (NOT serialized — reads don't touch the index) ──────────────────

/**
 * Commits that touched `relPath`, newest-first. Uses git.log({ filepath }) which
 * (in isomorphic-git ≥ 1.x, confirmed for the installed 1.38.x) returns only the
 * commits where that path's blob oid changed. Best-effort → [] on any error
 * (non-repo, no commits, unknown path). `limit` caps the walk depth.
 */
export async function logForPath(relPath: string, limit = 100): Promise<GitCommit[]> {
  try {
    const commits = await git.log({
      fs,
      dir: gitDir(),
      filepath: relPath,
      // `force` so an as-yet-untracked path yields [] instead of throwing.
      force: true,
      depth: limit,
    })
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message,
      timestamp: c.commit.author.timestamp,
      author: c.commit.author.name,
    }))
  } catch {
    return []
  }
}

/**
 * File content at a specific commit (best-effort → null). Resolves `oid` to the
 * tree and reads the blob at `relPath`; returns its UTF-8 text, or null if the
 * path didn't exist at that commit / the oid is unknown / not a repo.
 */
export async function readAtCommit(relPath: string, oid: string): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({ fs, dir: gitDir(), oid, filepath: relPath })
    return Buffer.from(blob).toString('utf8')
  } catch {
    return null
  }
}

/** Absolute path for a relPath under the git dir (helper; mirrors mirror.absPath). */
export function gitAbsPath(relPath: string): string {
  return join(gitDir(), relPath)
}
