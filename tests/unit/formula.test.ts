// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { evalFormula, expandRange } from '@/lib/editor/formula'

describe('expandRange', () => {
  it('single-column range A1:A3 → [A1, A2, A3]', () => {
    expect(expandRange('A1:A3')).toEqual(['A1', 'A2', 'A3'])
  })

  it('two-column range A1:B2 → [A1, B1, A2, B2] (col-major, then row-major)', () => {
    expect(expandRange('A1:B2')).toEqual(['A1', 'B1', 'A2', 'B2'])
  })

  it('single cell A1:A1 → [A1]', () => {
    expect(expandRange('A1:A1')).toEqual(['A1'])
  })

  it('multi-column multi-row C2:D3', () => {
    expect(expandRange('C2:D3')).toEqual(['C2', 'D2', 'C3', 'D3'])
  })
})

describe('evalFormula', () => {
  it('=SUM(A1:A3) with A1=1 A2=2 A3=3 → 6', () => {
    const cells = new Map([
      ['A1', 1],
      ['A2', 2],
      ['A3', 3],
    ])
    expect(evalFormula('=SUM(A1:A3)', cells)).toBe(6)
  })

  it('=AVG(A1:A3) → 2', () => {
    const cells = new Map([
      ['A1', 1],
      ['A2', 2],
      ['A3', 3],
    ])
    expect(evalFormula('=AVG(A1:A3)', cells)).toBe(2)
  })

  it('=AVERAGE(A1:A3) → same as AVG', () => {
    const cells = new Map([
      ['A1', 1],
      ['A2', 2],
      ['A3', 3],
    ])
    expect(evalFormula('=AVERAGE(A1:A3)', cells)).toBe(2)
  })

  it('=COUNT(A1:A3) counts only present numeric cells → 2', () => {
    const cells = new Map([
      ['A1', 1],
      ['A3', 3],
    ])
    expect(evalFormula('=COUNT(A1:A3)', cells)).toBe(2)
  })

  it('=SUM with comma list =SUM(A1,A3) → 4', () => {
    const cells = new Map([
      ['A1', 1],
      ['A3', 3],
    ])
    expect(evalFormula('=SUM(A1,A3)', cells)).toBe(4)
  })

  it('=SUM on empty map → 0', () => {
    expect(evalFormula('=SUM(A1:A3)', new Map())).toBe(0)
  })

  it('=AVG on empty map → {error}', () => {
    const result = evalFormula('=AVG(A1:A3)', new Map())
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('unknown function → {error}', () => {
    const result = evalFormula('=BOGUS(A1)', new Map([['A1', 1]]))
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('no leading = → {error}', () => {
    const result = evalFormula('not a formula', new Map())
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('large range =SUM(A1:A1000000) on empty map returns 0 quickly (no hang)', () => {
    // This tests that range expansion is bounded and doesn't hang
    const start = Date.now()
    const result = evalFormula('=SUM(A1:A1000000)', new Map())
    const elapsed = Date.now() - start
    expect(result).toBe(0)
    // Must complete well within 1 second
    expect(elapsed).toBeLessThan(1000)
  })
})
