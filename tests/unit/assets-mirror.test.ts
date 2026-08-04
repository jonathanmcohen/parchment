import { describe, expect, it } from 'vitest'
import {
  assetsDirName,
  assetsDirRelPath,
  toDbMarkdown,
  toDiskMarkdown,
} from '@/lib/disk/assets-mirror'

// v0.2.15: the mirror half of DB-backed assets. These cover the URL rewriting,
// which is the part with a genuine correctness risk: the disk copy and the
// database copy of a document's markdown legitimately DIFFER, and the round trip
// has to be exact or reverse-sync will either corrupt image links or classify
// every mirrored document as externally modified forever.

const DOC = '25bddaa2-b67c-4bab-9b0a-ec87f0af54fb'
const A = 'c67d1549-f511-4a57-b214-bf5e0844dc71.png'
const B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'

describe('assets directory naming', () => {
  it('sits beside the .md', () => {
    expect(assetsDirRelPath('Work/Q1/My Notes.md')).toBe('Work/Q1/My Notes.assets')
  })

  it('handles a doc at the root', () => {
    expect(assetsDirRelPath('Notes.md')).toBe('Notes.assets')
    expect(assetsDirName('Notes.md')).toBe('Notes.assets')
  })

  it('tracks the disambiguated filename, not the title', () => {
    // The mirror writes `My Notes (2).md` when two docs share a title. The assets
    // directory must follow that, or both docs would share one directory.
    expect(assetsDirRelPath('My Notes (2).md')).toBe('My Notes (2).assets')
  })

  it('strips only parent folders for the bare name', () => {
    expect(assetsDirName('Work/Q1/My Notes.md')).toBe('My Notes.assets')
  })
})

describe('toDiskMarkdown', () => {
  it('rewrites an api url to the relative path', () => {
    const md = `![shot](/api/docs/${DOC}/assets/${A})`
    expect(toDiskMarkdown(md, DOC, 'Notes.md')).toBe(`![shot](Notes.assets/${A})`)
  })

  it('percent-encodes spaces in the directory name', () => {
    // `![](My Doc.assets/x.png)` does not parse - the space terminates the URL.
    const md = `![](/api/docs/${DOC}/assets/${A})`
    expect(toDiskMarkdown(md, DOC, 'My Doc.md')).toBe(`![](My%20Doc.assets/${A})`)
  })

  it('rewrites every occurrence, including raw html', () => {
    const md = [
      `![one](/api/docs/${DOC}/assets/${A})`,
      `<img src="/api/docs/${DOC}/assets/${B}" alt="two">`,
    ].join('\n')
    const out = toDiskMarkdown(md, DOC, 'Notes.md')
    expect(out).toContain(`![one](Notes.assets/${A})`)
    expect(out).toContain(`<img src="Notes.assets/${B}" alt="two">`)
    expect(out).not.toContain('/api/docs/')
  })

  it('leaves the assets of a different document alone', () => {
    const other = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const md = `![x](/api/docs/${other}/assets/${A})`
    expect(toDiskMarkdown(md, DOC, 'Notes.md')).toBe(md)
  })

  it('is a no-op on markdown with no assets', () => {
    expect(toDiskMarkdown('# Title\n\nplain text', DOC, 'Notes.md')).toBe('# Title\n\nplain text')
  })

  it('handles empty markdown', () => {
    expect(toDiskMarkdown('', DOC, 'Notes.md')).toBe('')
  })
})

describe('toDbMarkdown', () => {
  it('is the exact inverse of toDiskMarkdown', () => {
    const md = [
      `![one](/api/docs/${DOC}/assets/${A})`,
      `<img src="/api/docs/${DOC}/assets/${B}">`,
      'unrelated [link](https://example.com/page)',
    ].join('\n\n')
    for (const relPath of ['Notes.md', 'My Doc.md', 'Work/Q1/My Notes (2).md']) {
      expect(toDbMarkdown(toDiskMarkdown(md, DOC, relPath), DOC, relPath)).toBe(md)
    }
  })

  it('accepts an unencoded directory name', () => {
    // Someone editing the file in Obsidian may well leave the space raw.
    const md = `![](My Doc.assets/${A})`
    expect(toDbMarkdown(md, DOC, 'My Doc.md')).toBe(`![](/api/docs/${DOC}/assets/${A})`)
  })

  it('ignores relative links that are not minted asset names', () => {
    // A human-authored file in a similarly named folder must survive untouched.
    const md = '![](Notes.assets/holiday-photo.png)'
    expect(toDbMarkdown(md, DOC, 'Notes.md')).toBe(md)
  })

  it('leaves ordinary relative links alone', () => {
    const md = '[see](../other/file.md) and ![](images/logo.png)'
    expect(toDbMarkdown(md, DOC, 'Notes.md')).toBe(md)
  })

  it('handles empty markdown', () => {
    expect(toDbMarkdown('', DOC, 'Notes.md')).toBe('')
  })
})

describe('round trip stability', () => {
  it('is idempotent in both directions', () => {
    const md = `![](/api/docs/${DOC}/assets/${A})`
    const disk = toDiskMarkdown(md, DOC, 'My Doc.md')
    expect(toDiskMarkdown(disk, DOC, 'My Doc.md')).toBe(disk)
    const back = toDbMarkdown(disk, DOC, 'My Doc.md')
    expect(toDbMarkdown(back, DOC, 'My Doc.md')).toBe(back)
  })

  it('survives a title with regex metacharacters', () => {
    // The directory name goes into a RegExp; an unescaped `(` would throw and a
    // `.` would match too broadly.
    const relPath = 'Report (final) [v2].md'
    const md = `![](/api/docs/${DOC}/assets/${A})`
    const disk = toDiskMarkdown(md, DOC, relPath)
    expect(disk).toContain('.assets/')
    expect(toDbMarkdown(disk, DOC, relPath)).toBe(md)
  })
})
