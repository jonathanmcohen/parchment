// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sweepOrphanReleaseNotesFiles } from '@/lib/disk/mirror'

// v0.2.9 #3 — sweep stale orphan `Release notes — v*.md` files from the guide
// folder. Prod carried an orphan `Release notes — v0.1.0.md` from June that no
// live doc pointed at (the recreate under fresh ids left prior filenames behind
// before removeDocFromDisk covered them). The sweep removes any
// `Release notes — v*.md` in the guide dir whose basename is NOT in the keep-set
// (the live docs' filenames). Best-effort: never throws.

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'parchment-sweep-'))
  process.env.PARCHMENT_FILES_ROOT = root
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  process.env.PARCHMENT_FILES_ROOT = undefined
})

async function seedGuideDir(files: string[]): Promise<string> {
  const guideRel = 'Parchment Guide'
  await mkdir(join(root, guideRel), { recursive: true })
  for (const f of files) await writeFile(join(root, guideRel, f), '# stub\n', 'utf8')
  return guideRel
}

describe('#3 sweepOrphanReleaseNotesFiles', () => {
  it('removes orphan Release notes files not in the keep-set', async () => {
    const guideRel = await seedGuideDir([
      'Release notes — v0.1.0.md', // orphan (prod)
      'Release notes — v0.2.7.md', // orphan (stale)
      'Release notes — v0.2.9.md', // LIVE — keep
      'Welcome to Parchment.md', // unrelated guide doc — keep
    ])
    const removed = await sweepOrphanReleaseNotesFiles(
      guideRel,
      new Set(['Release notes — v0.2.9.md']),
    )
    const remaining = await readdir(join(root, guideRel))
    expect(remaining.sort()).toEqual(
      ['Release notes — v0.2.9.md', 'Welcome to Parchment.md'].sort(),
    )
    // Reports the two orphans it removed (posix relpaths under root).
    expect(removed.sort()).toEqual(
      [
        'Parchment Guide/Release notes — v0.1.0.md',
        'Parchment Guide/Release notes — v0.2.7.md',
      ].sort(),
    )
  })

  it('keeps every Release notes file when all are live', async () => {
    const guideRel = await seedGuideDir(['Release notes — v0.2.9.md'])
    const removed = await sweepOrphanReleaseNotesFiles(
      guideRel,
      new Set(['Release notes — v0.2.9.md']),
    )
    expect(removed).toEqual([])
    expect(await readdir(join(root, guideRel))).toEqual(['Release notes — v0.2.9.md'])
  })

  it('never touches non-"Release notes" files even if orphaned', async () => {
    const guideRel = await seedGuideDir(['The editor & slash menu.md', 'Sharing & export.md'])
    const removed = await sweepOrphanReleaseNotesFiles(guideRel, new Set())
    expect(removed).toEqual([])
    expect((await readdir(join(root, guideRel))).sort()).toEqual(
      ['Sharing & export.md', 'The editor & slash menu.md'].sort(),
    )
  })

  it('is a no-op (never throws) when the guide directory does not exist', async () => {
    const removed = await sweepOrphanReleaseNotesFiles('Nonexistent Folder', new Set())
    expect(removed).toEqual([])
  })
})
