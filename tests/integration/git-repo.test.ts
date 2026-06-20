import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// F4: per-doc git module integration — a real temp dir as PARCHMENT_FILES_ROOT,
// real isomorphic-git, real node fs. No DB needed: this exercises the git layer
// directly. Every assertion also proves best-effort (never throws → sentinel).

import {
  commitPath,
  createBranch,
  ensureRepo,
  type GitCommit,
  gitAbsPath,
  gitDir,
  logForPath,
  mergeBranch,
  readAtCommit,
  removeAndCommit,
} from '@/lib/git/repo'

let filesDir: string
const prevRoot = process.env.PARCHMENT_FILES_ROOT

beforeEach(async () => {
  filesDir = await mkdtemp(join(tmpdir(), 'parchment-git-'))
  process.env.PARCHMENT_FILES_ROOT = filesDir
})

afterEach(() => {
  if (prevRoot === undefined) delete process.env.PARCHMENT_FILES_ROOT
  else process.env.PARCHMENT_FILES_ROOT = prevRoot
})

/** Write a file (relPath) under the current files root. */
async function writeRel(relPath: string, content: string): Promise<void> {
  await writeFile(gitAbsPath(relPath), content, 'utf8')
}

describe('F4 — git repo module', () => {
  it('ensureRepo creates a .git directory (idempotent)', async () => {
    expect(gitDir()).toBe(filesDir)
    await ensureRepo()
    expect(existsSync(join(filesDir, '.git'))).toBe(true)
    // Idempotent: a second call neither throws nor destroys the repo.
    await ensureRepo()
    expect(existsSync(join(filesDir, '.git'))).toBe(true)
  })

  it('commitPath stages + commits a file and returns its oid; logForPath surfaces it', async () => {
    await ensureRepo()
    await writeRel('note.md', '# Hello\n\nfirst body\n')

    const oid = await commitPath('note.md', 'edit: note.md')
    expect(oid).toBeTypeOf('string')
    expect((oid as string).length).toBeGreaterThan(0)

    const log = await logForPath('note.md')
    expect(log.length).toBe(1)
    expect(log[0]?.oid).toBe(oid)
    expect(log[0]?.message).toContain('note.md')
    expect(log[0]?.author).toBe('Parchment')
    expect(log[0]?.timestamp).toBeTypeOf('number')
  })

  it('a second commit to the same file → log has 2 entries, newest-first', async () => {
    await ensureRepo()
    await writeRel('note.md', 'v1\n')
    const oid1 = await commitPath('note.md', 'edit: note.md (1)')
    await writeRel('note.md', 'v2\n')
    const oid2 = await commitPath('note.md', 'edit: note.md (2)')

    expect(oid1).not.toBe(oid2)
    const log = await logForPath('note.md')
    expect(log.length).toBe(2)
    // newest-first
    expect(log[0]?.oid).toBe(oid2)
    expect(log[1]?.oid).toBe(oid1)
  })

  it('readAtCommit returns the OLD content at the first oid and NEW at the second (real history)', async () => {
    await ensureRepo()
    await writeRel('note.md', 'OLD CONTENT\n')
    const oid1 = (await commitPath('note.md', 'edit 1')) as string
    await writeRel('note.md', 'NEW CONTENT\n')
    const oid2 = (await commitPath('note.md', 'edit 2')) as string

    expect(await readAtCommit('note.md', oid1)).toBe('OLD CONTENT\n')
    expect(await readAtCommit('note.md', oid2)).toBe('NEW CONTENT\n')
  })

  it('commitPath with no change → null (no empty commit)', async () => {
    await ensureRepo()
    await writeRel('note.md', 'same\n')
    const oid1 = await commitPath('note.md', 'edit 1')
    expect(oid1).toBeTypeOf('string')

    // No file change → committing again must be a no-op (null), and the log
    // must still hold exactly one commit.
    const oid2 = await commitPath('note.md', 'edit 2 (no change)')
    expect(oid2).toBeNull()
    expect((await logForPath('note.md')).length).toBe(1)
  })

  it('removeAndCommit records a deletion in history', async () => {
    await ensureRepo()
    await writeRel('gone.md', 'temporary\n')
    await commitPath('gone.md', 'add gone.md')
    expect((await logForPath('gone.md')).length).toBe(1)

    const delOid = await removeAndCommit('gone.md', 'delete: gone.md')
    expect(delOid).toBeTypeOf('string')

    // The path's history now includes the deletion commit (2 commits touched it).
    const log = await logForPath('gone.md')
    expect(log.length).toBe(2)
    expect(log[0]?.message).toContain('delete')
  })

  it('logForPath is path-scoped: a commit to another file does not appear', async () => {
    await ensureRepo()
    await writeRel('a.md', 'a\n')
    await commitPath('a.md', 'edit a')
    await writeRel('b.md', 'b\n')
    await commitPath('b.md', 'edit b')

    expect((await logForPath('a.md')).length).toBe(1)
    expect((await logForPath('b.md')).length).toBe(1)
    expect((await logForPath('a.md'))[0]?.message).toContain('a')
  })

  it('createBranch + mergeBranch basic (clean merge)', async () => {
    await ensureRepo()
    await writeRel('m.md', 'base\n')
    await commitPath('m.md', 'base commit')

    // Branch at HEAD, then advance main with a non-conflicting NEW file.
    expect(await createBranch('feature')).toBe(true)
    await writeRel('feature-only.md', 'feature work\n')
    await commitPath('feature-only.md', 'add feature-only on main')

    // Merging the (now-behind) feature branch into the current branch is an
    // already-merged / clean fast no-op; it must not report a conflict.
    const result = await mergeBranch('feature')
    expect(result).not.toBeNull()
    expect((result as { conflict?: boolean }).conflict).not.toBe(true)
  })

  it('best-effort: a bogus files root makes every op return a sentinel, never throw', async () => {
    // Point at a path that cannot be a real working repo (a file, not a dir) so
    // ops fail internally — the CONTRACT is that NONE of them throw / reject
    // (that is what keeps the watcher/mirror/server alive). Ops that hit a real
    // error resolve to their sentinel (null / []). createBranch is excluded from
    // the strict-sentinel set below because isomorphic-git's `branch` is
    // permissive (it lazily creates plumbing and does NOT throw on a non-repo);
    // the best-effort guarantee for it is "never throws", asserted via resolves.
    const badFile = join(filesDir, 'not-a-dir')
    await writeFile(badFile, 'x', 'utf8')
    process.env.PARCHMENT_FILES_ROOT = badFile

    await expect(ensureRepo()).resolves.toBeUndefined()
    await expect(commitPath('whatever.md', 'm')).resolves.toBeNull()
    await expect(removeAndCommit('whatever.md', 'm')).resolves.toBeNull()
    await expect(logForPath('whatever.md')).resolves.toEqual([])
    await expect(readAtCommit('whatever.md', 'deadbeef')).resolves.toBeNull()
    await expect(mergeBranch('x')).resolves.toBeNull()
    // createBranch: only the no-throw contract is guaranteed (returns a boolean,
    // never rejects). A permissive success against a junk dir is acceptable —
    // nothing crashed.
    await expect(createBranch('x')).resolves.toEqual(expect.any(Boolean))
  })

  it('best-effort: log/read on a non-repo (no ensureRepo) return [] / null, no throw', async () => {
    // Fresh empty dir, never initialized as a repo.
    const fresh = await mkdtemp(join(tmpdir(), 'parchment-git-norepo-'))
    process.env.PARCHMENT_FILES_ROOT = fresh
    await expect(logForPath('any.md')).resolves.toEqual([])
    await expect(readAtCommit('any.md', 'deadbeef')).resolves.toBeNull()
  })

  it('concurrent commits to distinct files are serialized without corrupting the index', async () => {
    await ensureRepo()
    // Fire many commitPath calls without awaiting in sequence — the module queue
    // must serialize them so each lands as its own clean commit.
    const writes: Promise<string | null>[] = []
    for (let i = 0; i < 8; i++) {
      await writeRel(`c${i}.md`, `content ${i}\n`)
      writes.push(commitPath(`c${i}.md`, `edit c${i}`))
    }
    const oids = await Promise.all(writes)
    // Every commit succeeded (distinct files, real changes) and all oids differ.
    for (const oid of oids) expect(oid).toBeTypeOf('string')
    expect(new Set(oids).size).toBe(oids.length)
    // Each file has exactly one commit in its own history.
    for (let i = 0; i < 8; i++) {
      expect((await logForPath(`c${i}.md`)).length).toBe(1)
    }
  })

  it('GitCommit shape is stable (oid, message, timestamp, author)', async () => {
    await ensureRepo()
    await writeRel('shape.md', 'x\n')
    await commitPath('shape.md', 'shape commit')
    const log: GitCommit[] = await logForPath('shape.md')
    const c = log[0]
    expect(c).toBeDefined()
    expect(Object.keys(c as GitCommit).sort()).toEqual(
      ['author', 'message', 'oid', 'timestamp'].sort(),
    )
  })
})
