// S3-1 (DECISION 4): the save-status state machine.
//
// Today the body save is a fire-and-forget `void fetch` with NO
// isSaving/saved/lastSaved state anywhere. The doc title bar needs a small
// in-flight → settled → idle state so the save-status slot can read
// "Saving…" / "All changes saved" / an idle label (the COPY itself is
// S5-9; S3-1 owns the STATE). The save *path* is unchanged — this only observes
// in-flight/settled around the existing save.
//
// This is the pure transition function; the hook (useSaveStatus) drives it with
// the existing save and a 5-minute idle timer.

export type SaveStatus = 'idle' | 'saving' | 'saved'

export type SaveEvent = 'save-start' | 'save-settle' | 'idle-timeout'

// C3: which connection-aware tooltip COPY the save-status text shows. The STATE
// machine above is untouched — this is a pure mapping from the live collab
// connection state (online/syncing/offline) to a tooltip kind. The type is a
// type-only import so this module pulls in NO client/runtime code from the
// StatusBar (a 'use client' component); the union is erased at compile time.
import type { ConnectionState } from '@/components/editor/StatusBar'

export type SaveTooltipKind = 'synced' | 'offline'

/**
 * Map the live collab connection state to the save-status tooltip kind:
 *   • 'online'  → 'synced'  — collab confirmed healthy; the disk-mirrored save is
 *     also synced to the collab service.
 *   • 'syncing' → 'offline' — connecting; not yet a confirmed-healthy link, so we
 *     don't claim "synced" until the socket reports connected.
 *   • 'offline' → 'offline' — collab unreachable.
 * Only a CONFIRMED-online connection yields the synced copy.
 */
export function saveTooltipKind(connection: ConnectionState): SaveTooltipKind {
  return connection === 'online' ? 'synced' : 'offline'
}

/**
 * Pure transition: given the current status and an event, return the next
 * status. Stray events that don't apply to the current state are ignored
 * (return the same status), so a late timer or a settle with no save in flight
 * can never corrupt the displayed state.
 */
export function nextSaveStatus(current: SaveStatus, event: SaveEvent): SaveStatus {
  switch (event) {
    case 'save-start':
      // Any save (from idle OR from a freshly-settled 'saved') goes in-flight.
      return 'saving'
    case 'save-settle':
      // Only meaningful while a save is in flight.
      return current === 'saving' ? 'saved' : current
    case 'idle-timeout':
      // Only collapse a settled 'saved' back to idle; never interrupt a save.
      return current === 'saved' ? 'idle' : current
    default:
      return current
  }
}
