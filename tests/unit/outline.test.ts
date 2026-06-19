import { describe, expect, it } from 'vitest'
import type { Block } from '@/lib/editor/outline'
import { computeSections, moveSection } from '@/lib/editor/outline'

// ── Helpers ────────────────────────────────────────────────────────────────

const H = (level: number): Block => ({ type: 'heading', level })
const P = (): Block => ({ type: 'other' })

// ── computeSections ────────────────────────────────────────────────────────

describe('computeSections', () => {
  it('returns empty array for empty block list', () => {
    expect(computeSections([])).toEqual([])
  })

  it('returns empty array when there are no headings', () => {
    expect(computeSections([P(), P()])).toEqual([])
  })

  it('single heading with no body covers just itself', () => {
    expect(computeSections([H(1)])).toEqual([{ start: 0, end: 1, level: 1 }])
  })

  it('single heading followed by paragraphs covers the whole doc', () => {
    expect(computeSections([H(1), P(), P()])).toEqual([{ start: 0, end: 3, level: 1 }])
  })

  it('two sibling H1s split cleanly', () => {
    // [H1a, p, H1b, p]
    const blocks: Block[] = [H(1), P(), H(1), P()]
    expect(computeSections(blocks)).toEqual([
      { start: 0, end: 2, level: 1 },
      { start: 2, end: 4, level: 1 },
    ])
  })

  it('canonical example: [H1,p,H2,p,H1,p]', () => {
    // H1@0 covers [0,4) — H2 is a child
    // H2@2 covers [2,4)
    // H1@4 covers [4,6)
    const blocks: Block[] = [H(1), P(), H(2), P(), H(1), P()]
    expect(computeSections(blocks)).toEqual([
      { start: 0, end: 4, level: 1 },
      { start: 2, end: 4, level: 2 },
      { start: 4, end: 6, level: 1 },
    ])
  })

  it('H2 section ends at next H1 or H2', () => {
    // [H1, H2, p, H2, p]
    const blocks: Block[] = [H(1), H(2), P(), H(2), P()]
    expect(computeSections(blocks)).toEqual([
      { start: 0, end: 5, level: 1 }, // H1 covers all
      { start: 1, end: 3, level: 2 }, // H2a: ends before next H2
      { start: 3, end: 5, level: 2 }, // H2b: ends at doc end
    ])
  })

  it('deep nesting: H1 > H2 > H3', () => {
    const blocks: Block[] = [H(1), H(2), H(3), P()]
    expect(computeSections(blocks)).toEqual([
      { start: 0, end: 4, level: 1 }, // H1 covers all
      { start: 1, end: 4, level: 2 }, // H2 covers H3+p
      { start: 2, end: 4, level: 3 }, // H3 covers p
    ])
  })

  it('leading paragraphs (before first heading) are not in any section', () => {
    const blocks: Block[] = [P(), P(), H(2), P()]
    expect(computeSections(blocks)).toEqual([{ start: 2, end: 4, level: 2 }])
  })

  it('multiple H3s inside an H2, bounded by the next H2', () => {
    // [H2a, H3a, p, H3b, p, H2b]
    const blocks: Block[] = [H(2), H(3), P(), H(3), P(), H(2)]
    expect(computeSections(blocks)).toEqual([
      { start: 0, end: 5, level: 2 }, // H2a: stops before H2b
      { start: 1, end: 3, level: 3 }, // H3a: stops before H3b
      { start: 3, end: 5, level: 3 }, // H3b: stops before H2b
      { start: 5, end: 6, level: 2 }, // H2b: just itself
    ])
  })
})

// ── moveSection ────────────────────────────────────────────────────────────

describe('moveSection', () => {
  it('throws when fromHeadingIndex is not a section start', () => {
    const blocks: Block[] = [H(1), P()]
    expect(() => moveSection(blocks, 1, 0)).toThrow()
  })

  it('moves second H1 section before first H1 section', () => {
    // [H1a, p, H1b, p] → move from=2 to=0 → [H1b, p, H1a, p]
    const blocks: Block[] = [H(1), P(), H(1), P()]
    const result = moveSection(blocks, 2, 0)
    expect(result).toEqual([H(1), P(), H(1), P()])
    // Verify order: block at 0 came from index 2 (H1b), block at 2 came from index 0 (H1a)
    // Since both are H(1) structurally equal we verify via a labelled test below
  })

  it('canonical: move second H1 section to before first — subtree identity', () => {
    // Use distinct levels to track identity
    // [H1a(lv1), p, H2-child, p, H1b(lv1), p]
    // move from=4 (H1b section [4,6)) to=0 → [H1b,p, H1a,p,H2,p]
    const H1a: Block = { type: 'heading', level: 1 }
    const Pa: Block = { type: 'other' }
    const H2: Block = { type: 'heading', level: 2 }
    const Pb: Block = { type: 'other' }
    const H1b: Block = { type: 'heading', level: 1 }
    const Pc: Block = { type: 'other' }

    const blocks: Block[] = [H1a, Pa, H2, Pb, H1b, Pc]
    const result = moveSection(blocks, 4, 0)

    // H1b section ([4,6)) moves before index 0 → result: [H1b,Pc, H1a,Pa,H2,Pb]
    expect(result).toHaveLength(6)
    expect(result[0]).toBe(H1b)
    expect(result[1]).toBe(Pc)
    expect(result[2]).toBe(H1a)
    expect(result[3]).toBe(Pa)
    expect(result[4]).toBe(H2)
    expect(result[5]).toBe(Pb)
  })

  it('moving a parent heading carries child heading + paragraphs', () => {
    // [H1a, Pa, H2, Pb, H1b, Pc]
    // Move H1a section ([0,4)) to the end (toIdx = blocks.length = 6)
    // Result: [H1b, Pc, H1a, Pa, H2, Pb]
    const H1a: Block = { type: 'heading', level: 1 }
    const Pa: Block = { type: 'other' }
    const H2: Block = { type: 'heading', level: 2 }
    const Pb: Block = { type: 'other' }
    const H1b: Block = { type: 'heading', level: 1 }
    const Pc: Block = { type: 'other' }

    const blocks: Block[] = [H1a, Pa, H2, Pb, H1b, Pc]
    const result = moveSection(blocks, 0, blocks.length) // move to end

    // H1a carries H2+Pb as children; all move to end as a unit
    expect(result[0]).toBe(H1b)
    expect(result[1]).toBe(Pc)
    expect(result[2]).toBe(H1a)
    expect(result[3]).toBe(Pa)
    expect(result[4]).toBe(H2)
    expect(result[5]).toBe(Pb)
  })

  it('move to end when toHeadingIndex equals blocks.length', () => {
    // [H1, p, H2, p]  move H2 section ([2,4)) to end → same array
    const blocks: Block[] = [H(1), P(), H(2), P()]
    const result = moveSection(blocks, 2, blocks.length)
    // H2 is already at end; result should be same order
    expect(result).toEqual(blocks)
  })

  it('moving first section to end', () => {
    // [H1a, p, H1b, p]  move H1a ([0,2)) to end
    const H1a: Block = { type: 'heading', level: 1 }
    const Pa: Block = { type: 'other' }
    const H1b: Block = { type: 'heading', level: 1 }
    const Pb: Block = { type: 'other' }

    const blocks: Block[] = [H1a, Pa, H1b, Pb]
    const result = moveSection(blocks, 0, blocks.length)

    expect(result[0]).toBe(H1b)
    expect(result[1]).toBe(Pb)
    expect(result[2]).toBe(H1a)
    expect(result[3]).toBe(Pa)
  })

  it('does not mutate the original array', () => {
    const blocks: Block[] = [H(1), P(), H(1), P()]
    const original = [...blocks]
    moveSection(blocks, 2, 0)
    expect(blocks).toEqual(original)
  })

  it('H3 section moves independently within its parent H2', () => {
    // [H2, H3a, p, H3b, p]
    // move H3b ([3,5)) before H3a (toIdx=1)
    // result: [H2, H3b, p, H3a, p]
    const H2: Block = { type: 'heading', level: 2 }
    const H3a: Block = { type: 'heading', level: 3 }
    const Pa: Block = { type: 'other' }
    const H3b: Block = { type: 'heading', level: 3 }
    const Pb: Block = { type: 'other' }

    const blocks: Block[] = [H2, H3a, Pa, H3b, Pb]
    const result = moveSection(blocks, 3, 1)

    expect(result[0]).toBe(H2)
    expect(result[1]).toBe(H3b)
    expect(result[2]).toBe(Pb)
    expect(result[3]).toBe(H3a)
    expect(result[4]).toBe(Pa)
  })

  it('single-block section (heading with no body) moves cleanly', () => {
    // [H1, H2, H3]  move H3 (index=2) before H1 (index=0)
    const H1: Block = { type: 'heading', level: 1 }
    const H2: Block = { type: 'heading', level: 2 }
    const H3: Block = { type: 'heading', level: 3 }

    const blocks: Block[] = [H1, H2, H3]
    const result = moveSection(blocks, 2, 0)

    expect(result[0]).toBe(H3)
    expect(result[1]).toBe(H1)
    expect(result[2]).toBe(H2)
  })
})
