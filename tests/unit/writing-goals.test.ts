// J10-1: pure writing-goal math. No db / no React. Builds on counts.ts (words).

import { describe, expect, it } from 'vitest'
import { goalProgress, parseWritingGoal } from '@/lib/editor/goals'

describe('goalProgress', () => {
  it('reports 0% with nothing written', () => {
    expect(goalProgress({ words: 0, targetWords: 100 })).toEqual({
      pct: 0,
      remaining: 100,
      done: false,
    })
  })

  it('reports 50% halfway', () => {
    expect(goalProgress({ words: 50, targetWords: 100 })).toEqual({
      pct: 50,
      remaining: 50,
      done: false,
    })
  })

  it('clamps to 100% and done at exactly the target', () => {
    expect(goalProgress({ words: 100, targetWords: 100 })).toEqual({
      pct: 100,
      remaining: 0,
      done: true,
    })
  })

  it('clamps pct to 100 and remaining to 0 when over target', () => {
    expect(goalProgress({ words: 250, targetWords: 100 })).toEqual({
      pct: 100,
      remaining: 0,
      done: true,
    })
  })

  it('rounds pct to a whole number', () => {
    // 1/3 → 33%
    expect(goalProgress({ words: 1, targetWords: 3 }).pct).toBe(33)
  })

  it('treats a zero/absent target as no goal (0%, not NaN)', () => {
    expect(goalProgress({ words: 40, targetWords: 0 })).toEqual({
      pct: 0,
      remaining: 0,
      done: false,
    })
  })

  it('coerces a negative target to no goal', () => {
    expect(goalProgress({ words: 40, targetWords: -10 })).toEqual({
      pct: 0,
      remaining: 0,
      done: false,
    })
  })

  it('never produces NaN/Infinity for fractional inputs', () => {
    const r = goalProgress({ words: 7, targetWords: 13 })
    expect(Number.isFinite(r.pct)).toBe(true)
    expect(r.pct).toBeGreaterThanOrEqual(0)
    expect(r.pct).toBeLessThanOrEqual(100)
  })
})

describe('parseWritingGoal', () => {
  it('reads a positive integer target from a meta blob', () => {
    expect(parseWritingGoal({ targetWords: 500 })).toBe(500)
  })

  it('rounds a float and floors at 0', () => {
    expect(parseWritingGoal({ targetWords: 250.7 })).toBe(251)
  })

  it('returns 0 (no goal) for absent / malformed values', () => {
    expect(parseWritingGoal(undefined)).toBe(0)
    expect(parseWritingGoal(null)).toBe(0)
    expect(parseWritingGoal({})).toBe(0)
    expect(parseWritingGoal({ targetWords: 'lots' })).toBe(0)
    expect(parseWritingGoal({ targetWords: -5 })).toBe(0)
    expect(parseWritingGoal({ targetWords: Number.NaN })).toBe(0)
    expect(parseWritingGoal('nope')).toBe(0)
  })
})
