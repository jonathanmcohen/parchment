import { describe, expect, it } from 'vitest'
import { type SaveTooltipKind, saveTooltipKind } from '@/lib/docs/save-status'

// C3: the save-status text grows a connection-aware tooltip. The STATE machine
// (nextSaveStatus) is unchanged; this is a pure mapping from the live collab
// connection state to which tooltip COPY the title bar shows:
//   • online  → "synced"  (saved to disk AND synced to the collab service)
//   • syncing → "offline" (not yet confirmed synced — collab not healthy)
//   • offline → "offline" (collab unreachable)
// Only a CONFIRMED-online connection yields the synced copy; everything else is
// the offline/unavailable copy. Pure → unit-tested without React/i18n.

describe('saveTooltipKind', () => {
  it('online → synced (collab confirmed healthy)', () => {
    expect(saveTooltipKind('online')).toBe<SaveTooltipKind>('synced')
  })

  it('offline → offline (collab unreachable)', () => {
    expect(saveTooltipKind('offline')).toBe<SaveTooltipKind>('offline')
  })

  it('syncing → offline (collab not yet confirmed healthy)', () => {
    expect(saveTooltipKind('syncing')).toBe<SaveTooltipKind>('offline')
  })
})
