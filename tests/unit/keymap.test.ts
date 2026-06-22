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

  // Finding A: a shifted punctuation char folds to its unshifted physical key, so
  // a chord recorded as `?` (Shift+`/` on US layouts) normalizes to the same
  // stored combo as the `/` default.
  it('folds shifted punctuation to its unshifted physical key (finding A)', () => {
    expect(normalizeCombo('Mod-Shift-?')).toBe('Mod-Shift-/')
    expect(normalizeCombo('Cmd+Shift+?')).toBe('Mod-Shift-/')
    expect(normalizeCombo('Mod-Shift-/')).toBe('Mod-Shift-/')
    // The recorded form and the default must be byte-identical.
    expect(normalizeCombo('Mod-Shift-?')).toBe(normalizeCombo('Mod-Shift-/'))
  })

  // Finding E: `-` and `+` are LEGAL KEYS, never separators. They must survive
  // normalization instead of collapsing to a modifier-only combo.
  it('binds the `-` key without consuming it as a separator (finding E)', () => {
    expect(normalizeCombo('Mod--')).toBe('Mod--')
    expect(normalizeCombo('Mod+-')).toBe('Mod--')
    expect(normalizeCombo('Cmd+-')).toBe('Mod--')
    // Idempotent.
    expect(normalizeCombo(normalizeCombo('Mod+-'))).toBe('Mod--')
  })

  it('binds the `+` key without consuming it as a separator (finding E)', () => {
    // `+` is the shifted form of `=` on US layouts, so it folds to `=`.
    expect(normalizeCombo('Mod-+')).toBe('Mod-=')
    expect(normalizeCombo('Mod++')).toBe('Mod-=')
    // The bare `=` key (unshifted) round-trips as itself.
    expect(normalizeCombo('Mod-=')).toBe('Mod-=')
    expect(normalizeCombo(normalizeCombo('Mod++'))).toBe('Mod-=')
  })

  it('does not mistake a `-`/`+` key for a missing key (modifier-only guard)', () => {
    // A real modifier-only combo still collapses to just the modifier.
    expect(normalizeCombo('Mod')).toBe('Mod')
    expect(normalizeCombo('Shift')).toBe('Shift')
    // But Mod + `-` keeps the `-` key (does NOT collapse to a modifier-only combo
    // that sanitizeOverrides would reject).
    expect(normalizeCombo('Mod--')).toBe('Mod--')
    expect(normalizeCombo('Mod--')).not.toBe('Mod')
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

  // ── Finding A: ⌘⇧/ must fire even though Shift turns `/` into `?` ──
  //
  // On US/most QWERTY layouts pressing Cmd/Ctrl+Shift+/ delivers key:'?'
  // (code:'Slash'). The default combo is the literal 'Mod-Shift-/'. A literal
  // `e.key` comparison ('?' === '/') is false → the cheat sheet never opened.
  describe('finding A — layout-robust ⌘⇧/', () => {
    it('matches Mod-Shift-/ when the event reports key:"?" (Shift-folded)', () => {
      const e = {
        key: '?',
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }
      expect(matchesCombo(e, 'Mod-Shift-/')).toBe(true)
    })

    it('matches Mod-Shift-/ via the Shift-immune code:"Slash"', () => {
      const e = {
        key: '?',
        code: 'Slash',
        metaKey: false,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
      }
      expect(matchesCombo(e, 'Mod-Shift-/')).toBe(true)
    })

    it('still distinguishes ⌘/ from ⌘⇧/ (Shift bit must agree)', () => {
      // No Shift held → key:'/', should NOT match the Shift-requiring default.
      const noShift = {
        key: '/',
        code: 'Slash',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }
      expect(matchesCombo(noShift, 'Mod-Shift-/')).toBe(false)
      // ...but matches a Shift-less binding on the same physical key.
      expect(matchesCombo(noShift, 'Mod-/')).toBe(true)
    })
  })

  // ── Finding E: `-` and `+` are bindable keys ──
  describe('finding E — `-` / `+` bindings round-trip', () => {
    it('matches Mod+`-` (event key:"-", code:"Minus")', () => {
      const e = {
        key: '-',
        code: 'Minus',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }
      expect(matchesCombo(e, 'Mod--')).toBe(true)
      expect(matchesCombo(e, normalizeCombo('Mod+-'))).toBe(true)
    })

    it('matches Mod+`+` (Shift+`=`, event key:"+", code:"Equal")', () => {
      const e = {
        key: '+',
        code: 'Equal',
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }
      // `+` folds to the `=` physical key; the binding is Mod-Shift-=.
      expect(matchesCombo(e, normalizeCombo('Mod-Shift-+'))).toBe(true)
      expect(matchesCombo(e, 'Mod-Shift-=')).toBe(true)
    })
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
