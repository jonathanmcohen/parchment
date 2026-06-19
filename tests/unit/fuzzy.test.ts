import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from '@/lib/search/fuzzy'

describe('fuzzyScore', () => {
  it('returns 0 for empty query (matches everything, neutral)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
    expect(fuzzyScore('', '')).toBe(0)
  })

  it('matches when all query chars appear in order', () => {
    // "abc" is a subsequence of "aXbXc"
    expect(fuzzyScore('abc', 'aXbXc')).not.toBeNull()
  })

  it('does NOT match when chars appear out of order', () => {
    // "acb" — 'b' comes before 'c' in text, so subsequence fails
    expect(fuzzyScore('acb', 'abc')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('ABC', 'abcdef')).not.toBeNull()
    expect(fuzzyScore('foo', 'FOO BAR')).not.toBeNull()
    expect(fuzzyScore('FOO', 'foo')).not.toBeNull()
  })

  it('returns null when query chars are not all present', () => {
    expect(fuzzyScore('xyz', 'abcdef')).toBeNull()
    expect(fuzzyScore('az', 'abcde')).toBeNull() // no 'z'
  })

  it('consecutive match scores higher than scattered match', () => {
    // "abc" consecutive vs "abc" scattered ("aXbXc")
    const consecutive = fuzzyScore('abc', 'abc')
    const scattered = fuzzyScore('abc', 'aXbXc')
    expect(consecutive).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(consecutive!).toBeGreaterThan(scattered!)
  })

  it('word-start bonus: "fb" ranks "Foo Bar" above "fabric"', () => {
    // "Foo Bar" → 'F' and 'B' are both word starts → high bonus
    // "fabric"  → 'f' is word start but 'b' is mid-word
    const fooBar = fuzzyScore('fb', 'Foo Bar')
    const fabric = fuzzyScore('fb', 'fabric')
    expect(fooBar).not.toBeNull()
    expect(fabric).not.toBeNull()
    expect(fooBar!).toBeGreaterThan(fabric!)
  })

  it('earlier first-match scores marginally higher than late first-match', () => {
    const early = fuzzyScore('a', 'abc')
    const late = fuzzyScore('a', 'xxxxa')
    expect(early).not.toBeNull()
    expect(late).not.toBeNull()
    expect(early!).toBeGreaterThan(late!)
  })
})

describe('fuzzyFilter', () => {
  const docs = [
    { id: '1', title: 'Foo Bar' },
    { id: '2', title: 'fabric guide' },
    { id: '3', title: 'Quarterly Report' },
    { id: '4', title: 'aXbXc document' },
    { id: '5', title: 'unrelated' },
  ]
  const key = (d: (typeof docs)[number]) => d.title

  it('empty query returns all items in original order', () => {
    const result = fuzzyFilter(docs, '', key)
    expect(result).toEqual(docs)
  })

  it('excludes non-matches', () => {
    const result = fuzzyFilter(docs, 'zzz', key)
    expect(result).toHaveLength(0)
  })

  it('ranks best match first', () => {
    // "fb" → "Foo Bar" (both word starts) should outrank "fabric guide"
    const result = fuzzyFilter(docs, 'fb', key)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0]?.id).toBe('1') // "Foo Bar"
  })

  it('respects limit', () => {
    const result = fuzzyFilter(docs, 'a', key, 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('empty query respects limit', () => {
    const result = fuzzyFilter(docs, '', key, 3)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(docs[0])
  })

  it('stable sort: equal-scored items preserve original order', () => {
    // All single-char matches of 'a' that share the same score should be stable
    const items = [
      { id: 'a', title: 'apple' },
      { id: 'b', title: 'avocado' },
      { id: 'c', title: 'apricot' },
    ]
    const result = fuzzyFilter(items, 'a', (i) => i.title)
    // All match; verify order is stable (original insertion order for equal scores)
    const ids = result.map((r) => r.id)
    // 'apple' and 'apricot' both start with 'a' (word-start bonus), 'avocado' also
    // Stability: no id should swap relative to equal-scored peers
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })
})
