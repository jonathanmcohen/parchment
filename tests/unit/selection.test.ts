import { describe, expect, it } from 'vitest'
import { rangeBetween, selectOnly, toggle } from '@/lib/docs/selection'

describe('rangeBetween', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('returns inclusive slice in forward direction', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })

  it('returns inclusive slice in backward direction (same result)', () => {
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('returns a single-element array when anchor === target', () => {
    expect(rangeBetween(ids, 'c', 'c')).toEqual(['c'])
  })

  it('returns [] when anchorId is absent', () => {
    expect(rangeBetween(ids, 'z', 'a')).toEqual([])
  })

  it('returns [] when targetId is absent', () => {
    expect(rangeBetween(ids, 'a', 'z')).toEqual([])
  })

  it('returns [] for an empty id list', () => {
    expect(rangeBetween([], 'a', 'b')).toEqual([])
  })

  it('handles range spanning the full array', () => {
    expect(rangeBetween(ids, 'a', 'e')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('toggle', () => {
  it('adds an id that is not in the set', () => {
    const s = new Set<string>(['a', 'b'])
    const next = toggle(s, 'c')
    expect(next.has('c')).toBe(true)
    expect(next.size).toBe(3)
  })

  it('removes an id that is in the set', () => {
    const s = new Set<string>(['a', 'b'])
    const next = toggle(s, 'a')
    expect(next.has('a')).toBe(false)
    expect(next.size).toBe(1)
  })

  it('returns a new Set — does not mutate the input', () => {
    const s = new Set<string>(['a'])
    const next = toggle(s, 'b')
    // next is a different object
    expect(next).not.toBe(s)
    // original is unchanged
    expect(s.has('b')).toBe(false)
  })

  it('works on an empty set', () => {
    const s = new Set<string>()
    const next = toggle(s, 'x')
    expect(next.has('x')).toBe(true)
  })
})

describe('selectOnly', () => {
  it('returns a set containing exactly the given id', () => {
    const next = selectOnly('b')
    expect([...next]).toEqual(['b'])
    expect(next.size).toBe(1)
  })

  it('discards any previously-selected ids (single-click semantics)', () => {
    // selectOnly takes no prior set — the single-click gesture always collapses
    // selection to the clicked row, so the result must be just that one id.
    const next = selectOnly('only')
    expect(next.has('only')).toBe(true)
    expect(next.size).toBe(1)
  })

  it('returns a fresh Set each call', () => {
    const a = selectOnly('x')
    const b = selectOnly('x')
    expect(a).not.toBe(b)
  })
})
