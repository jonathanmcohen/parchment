'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { nextSaveStatus, remainingSettleDelayMs, type SaveStatus } from '@/lib/docs/save-status'

// S3-1 (DECISION 4): a small in-flight → settled → idle state wrapper around the
// EXISTING body save. The save *path* is unchanged — this hook only observes it:
// the caller calls `markSaving()` when a save fires and `markSaved()` when it
// settles. After a settle, a 5-minute idle timer flips 'saved' → 'idle'.
//
// S3-1 owns this STATE; S5-9 supplies the COPY strings that read it. No new
// network logic, no change to the fire-and-forget save semantics.

const IDLE_AFTER_MS = 5 * 60 * 1000 // 5 minutes

export type UseSaveStatus = {
  status: SaveStatus
  /** Call when a save request is dispatched (idle/saved → saving). */
  markSaving: () => void
  /** Call when the in-flight save settles (saving → saved, arms idle timer). */
  markSaved: () => void
}

export function useSaveStatus(): UseSaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // C5: floor the "Saving…" label so a sub-200ms save is still perceptible.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingStartedAt = useRef<number | null>(null)

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }, [])

  // C5: cancel any pending floored settle so a new save (or unmount) can never
  // be clobbered by a stale settle firing late.
  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
  }, [])

  // Commit the saving → saved transition and arm the 5-minute idle timer. The
  // idle timeout is UNCHANGED by C5 — only the moment we run this is floored.
  const settle = useCallback(() => {
    setStatus((s) => nextSaveStatus(s, 'save-settle'))
    clearIdleTimer()
    idleTimer.current = setTimeout(() => {
      setStatus((s) => nextSaveStatus(s, 'idle-timeout'))
    }, IDLE_AFTER_MS)
  }, [clearIdleTimer])

  const markSaving = useCallback(() => {
    // A new save supersedes any in-flight floor: cancel a pending settle so it
    // can't flip us to 'saved' mid-save.
    clearSettleTimer()
    clearIdleTimer()
    savingStartedAt.current = Date.now()
    setStatus((s) => nextSaveStatus(s, 'save-start'))
  }, [clearIdleTimer, clearSettleTimer])

  const markSaved = useCallback(() => {
    clearSettleTimer()
    const startedAt = savingStartedAt.current
    // No recorded start (defensive): settle immediately.
    const delay = startedAt === null ? 0 : remainingSettleDelayMs(startedAt, Date.now())
    if (delay <= 0) {
      // Slow save (past the floor): settle now — never artificially extended.
      settle()
      return
    }
    // Fast save (under the floor): keep "Saving…" visible for the remainder.
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      settle()
    }, delay)
  }, [clearSettleTimer, settle])

  // Clean up both timers on unmount (no stale settle/idle firing after teardown).
  useEffect(() => {
    return () => {
      clearIdleTimer()
      clearSettleTimer()
    }
  }, [clearIdleTimer, clearSettleTimer])

  return { status, markSaving, markSaved }
}
