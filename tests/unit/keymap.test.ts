import { describe, expect, it } from 'vitest'
import {
  type Binding,
  DEFAULT_BINDINGS,
  findConflicts,
  matchesCombo,
  mergeBindings,
  normalizeCombo,
} from '@/lib/help/keymap'

// I2 — pure keymap logic. No DOM, no @/db. Unit-tested here.

describe('normalizeCombo', () => {
  it('lowercases the trailing key', () => {
    expect(normalizeCombo('Mod-K')).toBe('Mod-k')
    expect(normalizeCombo('Mod-P')).toBe('Mod-p')
  })

  it('maps Cmd / Ctrl / Meta / Control → Mod', () => {
    expect(normalizeCombo('Cmd+K')).toBe('Mod-k')
    expect(normalizeCombo('Ctrl+K')).toBe('Mod-k')
    expect(normalizeCombo('meta+k')).toBe('Mod-k')
    expect(normalizeCombo('control+k')).toBe('Mod-k')
    expect(normalizeCombo('Command-K')).toBe('Mod-k')
  })

  it('is idempotent — normalizing a normalized combo is a no-op', () => {
    const once = normalizeCombo('Cmd+Shift+/')
    expect(normalizeCombo(once)).toBe(once)
    expect(normalizeCombo('Mod-Shift-/')).toBe('Mod-Shift-/')
  })

  it('orders modifiers canonically (Mod, then Shift, then Alt) regardless of input order', () => {
    expect(normalizeCombo('Shift+Cmd+K')).toBe('Mod-Shift-k')
    expect(normalizeCombo('Alt+Shift+Mod+k')).toBe('Mod-Shift-Alt-k')
    expect(normalizeCombo('shift-mod-/')).toBe('Mod-Shift-/')
  })

  it('handles a bare non-modifier key (e.g. F5)', () => {
    expect(normalizeCombo('F5')).toBe('f5')
    expect(normalizeCombo('f5')).toBe('f5')
  })
})

describe('mergeBindings', () => {
  const defaults: Binding[] = [
    {
      action: 'command-palette',
      defaultKeys: 'Mod-k',
      label: 'Command palette',
      customizable: true,
    },
    { action: 'presenter', defaultKeys: 'F5', label: 'Presenter', customizable: true },
    { action: 'bold', defaultKeys: 'Mod-b', label: 'Bold', customizable: false },
  ]

  it('applies a custom override to a customizable action (normalized)', () => {
    const merged = mergeBindings(defaults, { 'command-palette': 'Ctrl+J' })
    const palette = merged.find((b) => b.action === 'command-palette')
    expect(palette?.defaultKeys).toBe('Mod-j')
  })

  it('ignores an override targeting a non-customizable action', () => {
    const merged = mergeBindings(defaults, { bold: 'Mod-x' })
    const bold = merged.find((b) => b.action === 'bold')
    expect(bold?.defaultKeys).toBe('Mod-b')
  })

  it('ignores an override targeting an unknown action', () => {
    const merged = mergeBindings(defaults, { 'does-not-exist': 'Mod-q' })
    expect(merged).toHaveLength(defaults.length)
    expect(merged.find((b) => b.action === 'does-not-exist')).toBeUndefined()
  })

  it('does not mutate the input defaults array', () => {
    const before = JSON.stringify(defaults)
    mergeBindings(defaults, { 'command-palette': 'Ctrl+J' })
    expect(JSON.stringify(defaults)).toBe(before)
  })
})

describe('findConflicts', () => {
  it('detects two actions mapped to the same normalized combo', () => {
    const bindings: Binding[] = [
      { action: 'a', defaultKeys: 'Mod-k', label: 'A', customizable: true },
      { action: 'b', defaultKeys: 'Cmd+K', label: 'B', customizable: true },
    ]
    const conflicts = findConflicts(bindings)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.keys).toBe('Mod-k')
    expect(conflicts[0]?.actions.sort()).toEqual(['a', 'b'])
  })

  it('returns empty when there are no conflicts', () => {
    const bindings: Binding[] = [
      { action: 'a', defaultKeys: 'Mod-k', label: 'A', customizable: true },
      { action: 'b', defaultKeys: 'Mod-p', label: 'B', customizable: true },
    ]
    expect(findConflicts(bindings)).toEqual([])
  })
})

describe('matchesCombo', () => {
  it('returns true for a matching event', () => {
    const e = { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }
    expect(matchesCombo(e, 'Mod-k')).toBe(true)
  })

  it('returns false for a near-miss (missing shift)', () => {
    const e = { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }
    expect(matchesCombo(e, 'Mod-Shift-k')).toBe(false)
  })

  it('Mod matches meta OR ctrl', () => {
    const meta = { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }
    const ctrl = { key: 'k', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }
    expect(matchesCombo(meta, 'Mod-k')).toBe(true)
    expect(matchesCombo(ctrl, 'Mod-k')).toBe(true)
  })

  it('returns false when an extra modifier is held', () => {
    const e = { key: 'k', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }
    expect(matchesCombo(e, 'Mod-k')).toBe(false)
  })

  it('matches a function key with no modifiers', () => {
    const e = { key: 'F5', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
    expect(matchesCombo(e, 'F5')).toBe(true)
  })
})

describe('DEFAULT_BINDINGS', () => {
  it('contains the core app-level actions with stable ids', () => {
    const ids = DEFAULT_BINDINGS.map((b) => b.action)
    expect(ids).toContain('command-palette')
    expect(ids).toContain('fuzzy-finder')
    expect(ids).toContain('shortcuts-help')
    expect(ids).toContain('presenter')
  })

  it('has no conflicts among its default bindings', () => {
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([])
  })

  it('stores every defaultKeys in already-normalized form', () => {
    for (const b of DEFAULT_BINDINGS) {
      expect(normalizeCombo(b.defaultKeys)).toBe(b.defaultKeys)
    }
  })
})
