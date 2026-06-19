import { describe, expect, it } from 'vitest'
import { authorColor, collectChanges, resolveChange } from '@/lib/editor/track-changes'

describe('resolveChange', () => {
  it('accept insertion → keep-text-remove-mark', () => {
    expect(resolveChange('accept', 'insertion')).toBe('keep-text-remove-mark')
  })

  it('reject insertion → remove-text', () => {
    expect(resolveChange('reject', 'insertion')).toBe('remove-text')
  })

  it('accept deletion → remove-text', () => {
    expect(resolveChange('accept', 'deletion')).toBe('remove-text')
  })

  it('reject deletion → keep-text-remove-mark', () => {
    expect(resolveChange('reject', 'deletion')).toBe('keep-text-remove-mark')
  })
})

describe('authorColor', () => {
  it('returns a hex string', () => {
    const c = authorColor('alice')
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is stable across calls', () => {
    expect(authorColor('alice')).toBe(authorColor('alice'))
  })

  it('usually differs for different authors', () => {
    // With a 12-colour palette and distinct hashes, these should differ
    const colours = ['alice', 'bob', 'charlie', 'dave'].map(authorColor)
    const unique = new Set(colours)
    expect(unique.size).toBeGreaterThan(1)
  })

  it('handles empty string', () => {
    const c = authorColor('')
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('collectChanges', () => {
  it('returns one insertion change for a single marked run', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'abc',
              marks: [
                {
                  type: 'insertion',
                  attrs: { author: 'alice', color: '#1d4ed8', createdAt: '2026-06-19T00:00:00Z' },
                },
              ],
            },
          ],
        },
      ],
    }

    const changes = collectChanges(doc)
    expect(changes).toHaveLength(1)
    const c = changes[0]
    expect(c?.type).toBe('insertion')
    expect(c?.text).toBe('abc')
    expect(c?.author).toBe('alice')
  })

  it('returns one deletion change for a deletion-marked run', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'gone',
              marks: [{ type: 'deletion', attrs: { author: 'bob', color: '#15803d' } }],
            },
          ],
        },
      ],
    }

    const changes = collectChanges(doc)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.type).toBe('deletion')
    expect(changes[0]?.text).toBe('gone')
  })

  it('merges contiguous runs with the same mark into one change', () => {
    // Two adjacent text nodes both carrying insertion by the same author
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'hel',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1d4ed8' } }],
            },
            {
              type: 'text',
              text: 'lo',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1d4ed8' } }],
            },
          ],
        },
      ],
    }

    const changes = collectChanges(doc)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.text).toBe('hello')
  })

  it('keeps insertions and deletions as separate changes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'ins',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1d4ed8' } }],
            },
            {
              type: 'text',
              text: 'del',
              marks: [{ type: 'deletion', attrs: { author: 'alice', color: '#1d4ed8' } }],
            },
          ],
        },
      ],
    }

    const changes = collectChanges(doc)
    expect(changes).toHaveLength(2)
    expect(changes[0]?.type).toBe('insertion')
    expect(changes[1]?.type).toBe('deletion')
  })

  it('returns empty array for a doc with no tracked marks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'plain' }],
        },
      ],
    }

    expect(collectChanges(doc)).toHaveLength(0)
  })

  it('returns empty array for an empty doc', () => {
    const doc = { type: 'doc', content: [] }
    expect(collectChanges(doc)).toHaveLength(0)
  })
})
