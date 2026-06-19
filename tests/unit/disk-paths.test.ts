import { describe, expect, it } from 'vitest'
import { disambiguate, docRelPath, sanitizeSegment } from '@/lib/disk/paths'

describe('sanitizeSegment', () => {
  it('strips forward slashes', () => {
    expect(sanitizeSegment('foo/bar')).toBe('foobar')
  })

  it('strips backslashes', () => {
    expect(sanitizeSegment('foo\\bar')).toBe('foobar')
  })

  it('strips control characters', () => {
    expect(sanitizeSegment('foo\x00\x1f\x7fbar')).toBe('foobar')
  })

  it('strips leading dots', () => {
    expect(sanitizeSegment('...hidden')).toBe('hidden')
  })

  it('strips trailing dots', () => {
    expect(sanitizeSegment('file.')).toBe('file')
  })

  it('strips trailing spaces', () => {
    expect(sanitizeSegment('file   ')).toBe('file')
  })

  it('collapses internal whitespace', () => {
    expect(sanitizeSegment('foo   bar')).toBe('foo bar')
  })

  it('returns "untitled" for empty input', () => {
    expect(sanitizeSegment('')).toBe('untitled')
  })

  it('returns "untitled" for input that is only slashes', () => {
    expect(sanitizeSegment('///')).toBe('untitled')
  })

  it('caps long names at 120 characters', () => {
    const long = 'a'.repeat(200)
    const result = sanitizeSegment(long)
    expect(result.length).toBeLessThanOrEqual(120)
  })
})

describe('docRelPath', () => {
  it('builds path with folder chain and title', () => {
    expect(docRelPath(['Work', 'Q1'], 'My Notes')).toBe('Work/Q1/My Notes.md')
  })

  it('builds path with no folders (root doc)', () => {
    expect(docRelPath([], 'Stand Alone')).toBe('Stand Alone.md')
  })

  it('sanitizes each folder segment and the title', () => {
    expect(docRelPath(['Work/Projects', 'Q1'], 'My/Notes')).toBe('WorkProjects/Q1/MyNotes.md')
  })

  it('uses "untitled" for empty title', () => {
    expect(docRelPath([], '')).toBe('untitled.md')
  })
})

describe('disambiguate', () => {
  it('returns desired path when not taken', () => {
    const taken = new Set<string>()
    expect(disambiguate('Notes.md', taken)).toBe('Notes.md')
  })

  it('adds (2) when the desired path is taken', () => {
    const taken = new Set(['notes.md'])
    expect(disambiguate('Notes.md', taken)).toBe('Notes (2).md')
  })

  it('adds (3) when (2) is also taken', () => {
    const taken = new Set(['notes.md', 'notes (2).md'])
    expect(disambiguate('Notes.md', taken)).toBe('Notes (3).md')
  })

  it('case-insensitive collision detection', () => {
    const taken = new Set(['notes.md'])
    // 'Notes.md' lowercased matches 'notes.md' in taken
    expect(disambiguate('Notes.md', taken)).toBe('Notes (2).md')
  })

  it('works with nested paths', () => {
    const taken = new Set(['work/notes.md'])
    expect(disambiguate('Work/Notes.md', taken)).toBe('Work/Notes (2).md')
  })
})
