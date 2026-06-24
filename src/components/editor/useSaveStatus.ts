'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { nextSaveStatus, type SaveStatus } from '@/lib/docs/save-status'

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

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }, [])

  const markSaving = useCallback(() => {
    clearIdleTimer()
    setStatus((s) => nextSaveStatus(s, 'save-start'))
  }, [clearIdleTimer])

  const markSaved = useCallback(() => {
    setStatus((s) => nextSaveStatus(s, 'save-settle'))
    clearIdleTimer()
    idleTimer.current = setTimeout(() => {
      setStatus((s) => nextSaveStatus(s, 'idle-timeout'))
    }, IDLE_AFTER_MS)
  }, [clearIdleTimer])

  // Clean up the idle timer on unmount.
  useEffect(() => clearIdleTimer, [clearIdleTimer])

  return { status, markSaving, markSaved }
}
