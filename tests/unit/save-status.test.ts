import { describe, expect, it } from 'vitest'
import { nextSaveStatus, type SaveStatus } from '@/lib/docs/save-status'

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
