import { describe, expect, it } from 'vitest'
import { countText, readingTimeMinutes } from '@/lib/editor/counts'

describe('countText', () => {
  it('counts words and chars for simple input', () => {
    expect(countText('hello world')).toEqual({ words: 2, chars: 11 })
  })

  it('counts words by non-empty whitespace tokens; chars = raw length', () => {
    expect(countText('  spaced   out  ')).toEqual({ words: 2, chars: 16 })
  })

  it('returns zero for empty string', () => {
    expect(countText('')).toEqual({ words: 0, chars: 0 })
  })

  it('counts a single word', () => {
    expect(countText('one')).toEqual({ words: 1, chars: 3 })
  })
})

describe('readingTimeMinutes', () => {
  it('returns 0 for zero words', () => {
    expect(readingTimeMinutes(0)).toBe(0)
  })

  it('returns 1 for a single word', () => {
    expect(readingTimeMinutes(1)).toBe(1)
  })

  it('returns 1 for exactly 238 words (default wpm)', () => {
    expect(readingTimeMinutes(238)).toBe(1)
  })

  it('returns 2 for 239 words (ceil)', () => {
    expect(readingTimeMinutes(239)).toBe(2)
  })

  it('returns 3 for 500 words', () => {
    expect(readingTimeMinutes(500)).toBe(3)
  })
})
