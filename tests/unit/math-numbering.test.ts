// @vitest-environment node
//
// G4: pure equation-numbering helper. numberMathBlocks walks a ProseMirror doc
// (plain JSON here, no editor graph / no katex) and assigns each display
// equation (mathBlock) a 1-based number in document order, skipping inline math
// and equation refs. Runs in the node env with zero editor/katex deps.

import { describe, expect, it } from 'vitest'
import { numberMathBlocks } from '@/lib/editor/extensions/math'

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string) => ({ type: 'text', text: t })
const mathBlock = (latex: string) => ({ type: 'mathBlock', attrs: { latex } })
const mathInline = (latex: string) => ({ type: 'mathInline', attrs: { latex } })
const equationRef = (targetIndex: number) => ({ type: 'equationRef', attrs: { targetIndex } })

describe('G4 — numberMathBlocks', () => {
  it('numbers display equations 1..N in document order', () => {
    const d = doc(
      p(text('intro')),
      mathBlock('a'),
      p(text('middle')),
      mathBlock('b'),
      mathBlock('c'),
    )
    const map = numberMathBlocks(d)
    const numbers = [...map.values()].sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2, 3])
  })

  it('returns one entry per mathBlock (correct count)', () => {
    const d = doc(mathBlock('x'), mathBlock('y'))
    expect(numberMathBlocks(d).size).toBe(2)
  })

  it('skips inline math and equation refs — only mathBlock is numbered', () => {
    const d = doc(
      p(text('a'), mathInline('z'), text('b')),
      mathBlock('first'),
      p(equationRef(1)),
      mathBlock('second'),
    )
    const map = numberMathBlocks(d)
    expect(map.size).toBe(2)
    expect([...map.values()].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('assigns numbers in increasing document position order', () => {
    const d = doc(mathBlock('one'), p(text('gap')), mathBlock('two'), mathBlock('three'))
    const map = numberMathBlocks(d)
    // The block at the smallest position is numbered 1; the largest is 3.
    const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
    expect(entries.map(([, n]) => n)).toEqual([1, 2, 3])
  })

  it('a doc with no display equations yields an empty map', () => {
    const d = doc(p(text('plain')), p(text('still plain'), mathInline('q')))
    expect(numberMathBlocks(d).size).toBe(0)
  })

  it('positions are unique keys (no two equations share a position)', () => {
    const d = doc(mathBlock('a'), mathBlock('b'), mathBlock('c'))
    const map = numberMathBlocks(d)
    expect(new Set(map.keys()).size).toBe(map.size)
  })
})
