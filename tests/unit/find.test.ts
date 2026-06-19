import { describe, expect, it } from 'vitest'
import { applyReplacements, findMatches } from '@/lib/editor/find'

describe('findMatches', () => {
  it('returns 3 matches for "a" in "a A a" (case-insensitive default)', () => {
    const result = findMatches('a A a', 'a')
    expect(result).toEqual({
      ok: true,
      matches: [
        { from: 0, to: 1 },
        { from: 2, to: 3 },
        { from: 4, to: 5 },
      ],
    })
  })

  it('returns 2 matches for "a" in "a A a" with caseSensitive:true', () => {
    const result = findMatches('a A a', 'a', { caseSensitive: true })
    expect(result).toEqual({
      ok: true,
      matches: [
        { from: 0, to: 1 },
        { from: 4, to: 5 },
      ],
    })
  })

  it('returns 1 match for "cat" in "cat cats" with wholeWord:true', () => {
    const result = findMatches('cat cats', 'cat', { wholeWord: true })
    expect(result).toEqual({ ok: true, matches: [{ from: 0, to: 3 }] })
  })

  it('returns 3 matches for \\d in "a1 b2 c3" with regex:true', () => {
    const result = findMatches('a1 b2 c3', '\\d', { regex: true })
    expect(result).toEqual({
      ok: true,
      matches: [
        { from: 1, to: 2 },
        { from: 4, to: 5 },
        { from: 7, to: 8 },
      ],
    })
  })

  it('returns ok:false with error for invalid regex "()"', () => {
    const result = findMatches('x', '(', { regex: true })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('returns empty matches for empty query', () => {
    const result = findMatches('hello world', '')
    expect(result).toEqual({ ok: true, matches: [] })
  })
})

describe('applyReplacements', () => {
  it('replaces all matches right-to-left, producing "b b b"', () => {
    const result = applyReplacements(
      'a a a',
      [
        { from: 0, to: 1 },
        { from: 2, to: 3 },
        { from: 4, to: 5 },
      ],
      'b',
    )
    expect(result).toBe('b b b')
  })

  it('handles empty matches array (no change)', () => {
    expect(applyReplacements('hello', [], 'x')).toBe('hello')
  })

  it('handles single replacement', () => {
    expect(applyReplacements('hello world', [{ from: 6, to: 11 }], 'there')).toBe('hello there')
  })
})
