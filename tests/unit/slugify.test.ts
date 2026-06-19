import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/editor/extensions/heading-id'

describe('slugify', () => {
  it("slugify('Hello World!') === 'hello-world'", () => {
    expect(slugify('Hello World!')).toBe('hello-world')
  })

  it('strips punctuation', () => {
    expect(slugify("What's up?")).toBe('whats-up')
    expect(slugify('foo & bar')).toBe('foo-bar')
    expect(slugify('100% done.')).toBe('100-done')
  })

  it('handles leading/trailing whitespace and hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
    expect(slugify('---hello---')).toBe('hello')
    expect(slugify('  -- hello -- ')).toBe('hello')
  })

  it('collapses consecutive dashes', () => {
    expect(slugify('hello   world')).toBe('hello-world')
    expect(slugify('a  -  b')).toBe('a-b')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('lowercases everything', () => {
    expect(slugify('ABC DEF')).toBe('abc-def')
  })

  it('preserves numbers', () => {
    expect(slugify('Chapter 1: Intro')).toBe('chapter-1-intro')
  })

  it('handles unicode by stripping non-ascii alnum', () => {
    expect(slugify('Café au lait')).toBe('caf-au-lait')
  })
})
