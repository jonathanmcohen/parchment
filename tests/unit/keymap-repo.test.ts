import { describe, expect, it } from 'vitest'
import { sanitizeOverrides } from '@/lib/help/keymap-repo'

// I2 — sanitizeOverrides is pure (no DB): it validates/normalizes the persisted
// overrides map. The DB-backed get/set wrappers are an integration concern.

describe('sanitizeOverrides', () => {
  it('keeps a valid override for a customizable action (normalized)', () => {
    expect(sanitizeOverrides({ 'command-palette': 'Ctrl+J' })).toEqual({
      'command-palette': 'Mod-j',
    })
  })

  it('drops an override for a non-customizable action', () => {
    expect(sanitizeOverrides({ bold: 'Mod-x' })).toEqual({})
  })

  it('drops an override for an unknown action', () => {
    expect(sanitizeOverrides({ 'made-up': 'Mod-q' })).toEqual({})
  })

  it('drops a modifier-only combo (no real key)', () => {
    expect(sanitizeOverrides({ 'command-palette': 'Cmd+Shift' })).toEqual({})
  })

  it('drops non-string values and returns {} for non-object input', () => {
    expect(sanitizeOverrides({ 'command-palette': 42 })).toEqual({})
    expect(sanitizeOverrides(null)).toEqual({})
    expect(sanitizeOverrides('nope')).toEqual({})
  })
})
