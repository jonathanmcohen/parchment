import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTOSAVE_MS,
  MAX_AUTOSAVE_MS,
  MIN_AUTOSAVE_MS,
  clampAutosaveMs,
} from '@/lib/docs/settings-repo'

// I3: pure clampAutosaveMs helper — no DB needed.

describe('I3 — clampAutosaveMs', () => {
  it('clamps a value below MIN to MIN', () => {
    expect(clampAutosaveMs(0)).toBe(MIN_AUTOSAVE_MS)
    expect(clampAutosaveMs(1000)).toBe(MIN_AUTOSAVE_MS)
    expect(clampAutosaveMs(-999)).toBe(MIN_AUTOSAVE_MS)
  })

  it('clamps a value above MAX to MAX', () => {
    expect(clampAutosaveMs(600_000)).toBe(MAX_AUTOSAVE_MS)
    expect(clampAutosaveMs(Number.MAX_SAFE_INTEGER)).toBe(MAX_AUTOSAVE_MS)
  })

  it('returns DEFAULT_AUTOSAVE_MS for non-finite inputs', () => {
    expect(clampAutosaveMs(Number.NaN)).toBe(DEFAULT_AUTOSAVE_MS)
    expect(clampAutosaveMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_AUTOSAVE_MS)
    expect(clampAutosaveMs(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_AUTOSAVE_MS)
  })

  it('returns the value unchanged when already in range', () => {
    expect(clampAutosaveMs(30_000)).toBe(30_000)
    expect(clampAutosaveMs(MIN_AUTOSAVE_MS)).toBe(MIN_AUTOSAVE_MS)
    expect(clampAutosaveMs(MAX_AUTOSAVE_MS)).toBe(MAX_AUTOSAVE_MS)
    expect(clampAutosaveMs(60_000)).toBe(60_000)
  })
})
