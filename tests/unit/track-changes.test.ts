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

  // S1-5: the caret palette was retuned to seat Google-Docs blue first and to
  // drop the violet residue (#6d28d9). These assert the palette stays distinct
  // (so a 2nd collaborator gets a clearly different caret hue) and purple-free.
  it('never returns the retired violet residue #6d28d9', () => {
    // Probe a wide spread of author ids; none should map to the old violet.
    for (let i = 0; i < 200; i++) {
      expect(authorColor(`author-${i}`)).not.toBe('#6d28d9')
    }
  })

  it('maps a spread of distinct authors to several distinct hues', () => {
    // A 12-colour palette over many ids should surface multiple distinct hues,
    // so two simultaneous collaborators are very likely to differ.
    const ids = Array.from({ length: 24 }, (_, i) => `user-${i}`)
    const unique = new Set(ids.map(authorColor))
    expect(unique.size).toBeGreaterThanOrEqual(6)
  })

  it('every produced colour is a 6-digit hex (no malformed palette entry)', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `seed${i}`)
    for (const id of ids) {
      expect(authorColor(id)).toMatch(/^#[0-9a-f]{6}$/i)
    }
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

  // ── Task 5 — merge predicate must NOT cross author OR type ────────────────
  it('does NOT merge an A-insertion immediately followed by a B-deletion (different author AND type)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'aaa',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1a73e8' } }],
            },
            {
              type: 'text',
              text: 'bbb',
              marks: [{ type: 'deletion', attrs: { author: 'bob', color: '#be123c' } }],
            },
          ],
        },
      ],
    }
    const changes = collectChanges(doc)
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ type: 'insertion', author: 'alice', text: 'aaa' })
    expect(changes[1]).toMatchObject({ type: 'deletion', author: 'bob', text: 'bbb' })
  })

  it('does NOT merge two adjacent SAME-type runs by DIFFERENT authors', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'aaa',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1a73e8' } }],
            },
            {
              type: 'text',
              text: 'ccc',
              marks: [{ type: 'insertion', attrs: { author: 'carol', color: '#15803d' } }],
            },
          ],
        },
      ],
    }
    const changes = collectChanges(doc)
    expect(changes).toHaveLength(2)
    expect(changes[0]?.author).toBe('alice')
    expect(changes[1]?.author).toBe('carol')
  })

  it('does NOT merge two adjacent SAME-author runs of DIFFERENT type', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'iii',
              marks: [{ type: 'insertion', attrs: { author: 'alice', color: '#1a73e8' } }],
            },
            {
              type: 'text',
              text: 'ddd',
              marks: [{ type: 'deletion', attrs: { author: 'alice', color: '#be123c' } }],
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
})
