import { describe, expect, it } from 'vitest'
import {
  nextSaveStatus,
  remainingSettleDelayMs,
  SAVING_FLOOR_MS,
  type SaveStatus,
} from '@/lib/docs/save-status'

// S3-1 (DECISION 4): a minimal in-flight → settled → idle state machine wrapped
// around the EXISTING fire-and-forget body save. S3-1 owns the STATE; S5-9 owns
// the COPY. The save *path* is unchanged — this only observes it.
//
//   idle  --save-start-->  saving
//   saving --save-settle--> saved
//   saved  --idle-timeout--> idle
//
// A new save while 'saved' goes back to 'saving'. The reducer is pure so the
// transitions are unit-tested without timers/network.

describe('nextSaveStatus', () => {
  it('idle → saving on save-start', () => {
    expect(nextSaveStatus('idle', 'save-start')).toBe<SaveStatus>('saving')
  })

  it('saving → saved on save-settle', () => {
    expect(nextSaveStatus('saving', 'save-settle')).toBe<SaveStatus>('saved')
  })

  it('saved → idle on idle-timeout', () => {
    expect(nextSaveStatus('saved', 'idle-timeout')).toBe<SaveStatus>('idle')
  })

  it('saved → saving when a new save starts before the idle timeout', () => {
    expect(nextSaveStatus('saved', 'save-start')).toBe<SaveStatus>('saving')
  })

  it('ignores a stray settle while idle (no save in flight)', () => {
    expect(nextSaveStatus('idle', 'save-settle')).toBe<SaveStatus>('idle')
  })

  it('ignores an idle-timeout fired while a save is in flight', () => {
    expect(nextSaveStatus('saving', 'idle-timeout')).toBe<SaveStatus>('saving')
  })

  it('a second save-start while saving stays saving (coalesced in-flight)', () => {
    expect(nextSaveStatus('saving', 'save-start')).toBe<SaveStatus>('saving')
  })
})

// C5: a minimum-visible floor so the "Saving…" transient is perceptible even on a
// sub-200ms save. `remainingSettleDelayMs` is the PURE timing helper: given when
// the save started, "now", and the floor, it returns how long the settle to
// 'saved' must be deferred so "Saving…" stays visible ≥ floor. The save PATH and
// timing are unchanged — only the LABEL transition is floored.
describe('remainingSettleDelayMs', () => {
  it('exposes a floor in the 200–500ms perceptible window', () => {
    expect(SAVING_FLOOR_MS).toBeGreaterThanOrEqual(200)
    expect(SAVING_FLOOR_MS).toBeLessThanOrEqual(500)
  })

  it('defers a sub-floor save by the remaining time so Saving… stays visible', () => {
    // Saved instantly (0ms elapsed) → defer the full floor.
    expect(remainingSettleDelayMs(1_000, 1_000, 300)).toBe(300)
    // Settled after 120ms → defer the remaining 180ms.
    expect(remainingSettleDelayMs(1_000, 1_120, 300)).toBe(180)
  })

  it('does NOT extend a slow save past the floor (settles immediately)', () => {
    // Exactly at the floor → no extra delay.
    expect(remainingSettleDelayMs(1_000, 1_300, 300)).toBe(0)
    // Well past the floor → no extra delay (never negative).
    expect(remainingSettleDelayMs(1_000, 5_000, 300)).toBe(0)
  })

  it('clamps a backwards clock to the floor, never an inflated delay', () => {
    // now < start → elapsed clamped to 0 → at most the full floor, never inflated.
    expect(remainingSettleDelayMs(2_000, 1_000, 300)).toBe(300)
  })

  it('uses SAVING_FLOOR_MS when no explicit floor is passed', () => {
    // 0ms elapsed → the full default floor.
    expect(remainingSettleDelayMs(1_000, 1_000)).toBe(SAVING_FLOOR_MS)
  })
})
