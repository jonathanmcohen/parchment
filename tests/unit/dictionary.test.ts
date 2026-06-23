// @vitest-environment node
//
// K7: pure-side coverage for the custom-dictionary helpers — normalizeWord,
// normalizeDict (dedupe/cap), and filterMatchesByDict (case-insensitive drop +
// keep-others + bounds safety). No editor graph, no @/db, no env — pure string
// logic (mirrors the find.test.ts / cairn-link.test.ts pure structure).

import { describe, expect, it } from 'vitest'
import {
  filterMatchesByDict,
  type Match,
  MAX_DICT_WORDS,
  normalizeDict,
  normalizeWord,
} from '@/lib/integrations/dictionary'

const mk = (offset: number, length: number, rule = 'RULE'): Match => ({
  offset,
  length,
  message: 'msg',
  replacements: [],
  rule: { id: rule, category: 'CAT' },
})

describe('K7 — normalizeWord', () => {
  it('trims, lower-cases, and length-caps', () => {
    expect(normalizeWord('  Acme  ')).toBe('acme')
    expect(normalizeWord('HELLO')).toBe('hello')
    expect(normalizeWord('x'.repeat(100))).toHaveLength(64)
  })

  it('returns empty for non-strings and whitespace-only input', () => {
    expect(normalizeWord('   ')).toBe('')
    expect(normalizeWord(null)).toBe('')
    expect(normalizeWord(42)).toBe('')
    expect(normalizeWord(undefined)).toBe('')
  })
})

describe('K7 — normalizeDict', () => {
  it('normalizes, dedupes case-insensitively, and preserves first-seen order', () => {
    expect(normalizeDict(['Acme', 'acme', 'Beta', '  beta '])).toEqual(['acme', 'beta'])
  })

  it('drops empties and non-strings', () => {
    expect(normalizeDict(['a', '', '  ', null, 7, 'b'])).toEqual(['a', 'b'])
  })

  it('returns [] for non-array input', () => {
    expect(normalizeDict('nope')).toEqual([])
    expect(normalizeDict(null)).toEqual([])
  })

  it('caps the list length at MAX_DICT_WORDS', () => {
    const big = Array.from({ length: MAX_DICT_WORDS + 50 }, (_, i) => `w${i}`)
    expect(normalizeDict(big)).toHaveLength(MAX_DICT_WORDS)
  })
})

describe('K7 — filterMatchesByDict', () => {
  // text:   "Acme teh foo"
  //          0123456789...
  // "Acme" at [0,4); "teh" at [5,8); "foo" at [9,12)
  const text = 'Acme teh foo'

  it('drops a match whose flagged span is in the dict (case-insensitive) and keeps others', () => {
    const acme = mk(0, 4) // "Acme"
    const teh = mk(5, 3) // "teh"
    const result = filterMatchesByDict([acme, teh], text, ['acme'])
    // "Acme" is suppressed by dict word "acme"; the "teh" typo is kept.
    expect(result).toEqual([teh])
  })

  it('matches the dict case-insensitively (dict has different case than the text)', () => {
    const acme = mk(0, 4) // "Acme"
    expect(filterMatchesByDict([acme], text, ['ACME'])).toEqual([])
  })

  it('keeps all matches when the dict is empty', () => {
    const acme = mk(0, 4)
    const teh = mk(5, 3)
    expect(filterMatchesByDict([acme, teh], text, [])).toEqual([acme, teh])
  })

  it('keeps a match whose flagged word is not in the dict', () => {
    const teh = mk(5, 3) // "teh"
    expect(filterMatchesByDict([teh], text, ['acme', 'foo'])).toEqual([teh])
  })

  it('keeps matches with out-of-range or zero-length spans (never silently swallows)', () => {
    const oob = mk(100, 4) // beyond text
    const zero = mk(0, 0) // zero length
    const result = filterMatchesByDict([oob, zero], text, ['acme'])
    expect(result).toEqual([oob, zero])
  })

  it('does not mutate the input array', () => {
    const acme = mk(0, 4)
    const teh = mk(5, 3)
    const input = [acme, teh]
    filterMatchesByDict(input, text, ['acme'])
    expect(input).toEqual([acme, teh])
  })

  it('returns [] for empty matches', () => {
    expect(filterMatchesByDict([], text, ['acme'])).toEqual([])
  })
})
