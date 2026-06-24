import { describe, expect, it } from 'vitest'
import { activeHeadingId } from '@/lib/editor/outline-active'

// S3-5: deriving "which heading row is active" from the cursor position is pure
// derived state (no new effect, no loop — folded into the existing update
// handler per the G7/G8 lessons). Given the document positions of each heading
// (ascending) and the current cursor position, the active heading is the last
// heading at or before the cursor.

const headings = [
  { id: 'intro', pos: 1 },
  { id: 'body', pos: 50 },
  { id: 'conclusion', pos: 120 },
]

describe('activeHeadingId', () => {
  it('returns null when there are no headings', () => {
    expect(activeHeadingId([], 10)).toBeNull()
  })

  it('returns the first heading when the cursor is before all headings', () => {
    // Cursor at 0, before the first heading at pos 1 → still belongs to nothing
    // above it; the first heading is the closest section, so it is active.
    expect(activeHeadingId(headings, 0)).toBe('intro')
  })

  it('returns the heading whose section the cursor sits in', () => {
    expect(activeHeadingId(headings, 1)).toBe('intro')
    expect(activeHeadingId(headings, 49)).toBe('intro')
    expect(activeHeadingId(headings, 50)).toBe('body')
    expect(activeHeadingId(headings, 119)).toBe('body')
    expect(activeHeadingId(headings, 120)).toBe('conclusion')
    expect(activeHeadingId(headings, 5000)).toBe('conclusion')
  })

  it('is order-independent on input (sorts by pos internally)', () => {
    const shuffled = [
      { id: 'conclusion', pos: 120 },
      { id: 'intro', pos: 1 },
      { id: 'body', pos: 50 },
    ]
    expect(activeHeadingId(shuffled, 60)).toBe('body')
  })
})
