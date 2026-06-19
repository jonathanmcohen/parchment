import { describe, expect, it } from 'vitest'
import { diffLineKind, parseLineRanges } from '@/lib/editor/code-block-lines'

describe('parseLineRanges', () => {
  it('parses comma-separated single numbers', () => {
    expect(parseLineRanges('1,3-5')).toEqual(new Set([1, 3, 4, 5]))
  })

  it('strips surrounding braces and spaces', () => {
    expect(parseLineRanges('{2-4}')).toEqual(new Set([2, 3, 4]))
  })

  it('returns empty set for empty string', () => {
    expect(parseLineRanges('')).toEqual(new Set())
  })

  it('ignores invalid tokens, keeps valid ones', () => {
    expect(parseLineRanges('x,2')).toEqual(new Set([2]))
  })

  it('handles single number without range', () => {
    expect(parseLineRanges('5')).toEqual(new Set([5]))
  })

  it('handles ranges inclusive', () => {
    expect(parseLineRanges('3-6')).toEqual(new Set([3, 4, 5, 6]))
  })

  it('handles spaces around tokens', () => {
    expect(parseLineRanges('{1, 3-5}')).toEqual(new Set([1, 3, 4, 5]))
  })

  it('ignores tokens where range start > end', () => {
    expect(parseLineRanges('5-3')).toEqual(new Set())
  })
})

describe('diffLineKind', () => {
  it('returns add for + prefixed line', () => {
    expect(diffLineKind('+added')).toBe('add')
  })

  it('returns del for - prefixed line', () => {
    expect(diffLineKind('-gone')).toBe('del')
  })

  it('returns null for +++ (file header)', () => {
    expect(diffLineKind('+++ a/file')).toBeNull()
  })

  it('returns null for --- (file header)', () => {
    expect(diffLineKind('--- a/file')).toBeNull()
  })

  it('returns null for context line with space', () => {
    expect(diffLineKind(' ctx')).toBeNull()
  })

  it('returns null for ordinary code line', () => {
    expect(diffLineKind('code')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(diffLineKind('')).toBeNull()
  })
})
