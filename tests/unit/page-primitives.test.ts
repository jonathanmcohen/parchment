import { describe, expect, it } from 'vitest'
import { formatPageNumber, mergeBreaks } from '@/lib/editor/page-primitives'

describe('formatPageNumber', () => {
  it('format 1 (decimal): returns decimal string', () => {
    expect(formatPageNumber(1, '1')).toBe('1')
  })

  it('format 1 (decimal): returns 2 for page 2', () => {
    expect(formatPageNumber(2, '1')).toBe('2')
  })

  it('format i (lower roman): returns iv for 4', () => {
    expect(formatPageNumber(4, 'i')).toBe('iv')
  })

  it('format i (lower roman): returns i for 1', () => {
    expect(formatPageNumber(1, 'i')).toBe('i')
  })

  it('format i (lower roman): returns iii for 3', () => {
    expect(formatPageNumber(3, 'i')).toBe('iii')
  })

  it('format I (upper roman): returns II for 2', () => {
    expect(formatPageNumber(2, 'I')).toBe('II')
  })

  it('format I (upper roman): returns I for 1', () => {
    expect(formatPageNumber(1, 'I')).toBe('I')
  })

  it('format I (upper roman): returns XIV for 14', () => {
    expect(formatPageNumber(14, 'I')).toBe('XIV')
  })

  it('format a (lower alpha): returns a for 1', () => {
    expect(formatPageNumber(1, 'a')).toBe('a')
  })

  it('format a (lower alpha): returns aa for 27', () => {
    expect(formatPageNumber(27, 'a')).toBe('aa')
  })

  it('format a (lower alpha): returns b for 2', () => {
    expect(formatPageNumber(2, 'a')).toBe('b')
  })

  it('format A (upper alpha): returns A for 1', () => {
    expect(formatPageNumber(1, 'A')).toBe('A')
  })

  it('format A (upper alpha): returns B for 2', () => {
    expect(formatPageNumber(2, 'A')).toBe('B')
  })

  it('format none: returns empty string', () => {
    expect(formatPageNumber(3, 'none')).toBe('')
  })

  it('format none: returns empty string for any n', () => {
    expect(formatPageNumber(100, 'none')).toBe('')
  })
})

describe('mergeBreaks', () => {
  it('merges, sorts, and dedupes auto and manual offsets', () => {
    expect(mergeBreaks([1056, 2112], [500])).toEqual([500, 1056, 2112])
  })

  it('deduplicates overlapping offsets', () => {
    expect(mergeBreaks([1056, 2112], [1056])).toEqual([1056, 2112])
  })

  it('handles empty manual offsets', () => {
    expect(mergeBreaks([1056, 2112], [])).toEqual([1056, 2112])
  })

  it('handles empty auto offsets', () => {
    expect(mergeBreaks([], [500, 200])).toEqual([200, 500])
  })

  it('handles both empty', () => {
    expect(mergeBreaks([], [])).toEqual([])
  })

  it('sorts all offsets ascending', () => {
    expect(mergeBreaks([3000, 1000], [2000, 500])).toEqual([500, 1000, 2000, 3000])
  })
})
