// I2 — PURE keyboard-shortcut keymap. No DOM, no React, no @/db.
//
// This module is the single source of truth for Parchment's APP-LEVEL keyboard
// shortcuts (command palette, fuzzy finder, shortcuts cheat sheet, presenter).
// It is consumed by:
//   - the central GlobalShortcuts dispatcher (client island) which reads the
//     merged keymap and routes a matching keydown to the right action,
//   - the help cheat sheet (HelpMenu) which renders the merged keymap so custom
//     bindings are reflected,
//   - the Shortcuts settings UI which records/validates new combos,
//   - keymap-repo.ts (server) which validates persisted overrides via
//     normalizeCombo before storing them.
//
// SCOPE — only the entries with `customizable: true` are remappable. The deep
// in-editor formatting marks (bold/italic/underline/undo/etc.) are owned by the
// Tiptap StarterKit keymap and stay STANDARD in v0.1 — they appear here only as
// read-only reference rows (`customizable: false`) so the cheat sheet remains a
// complete reference. Remapping those would require rebuilding Tiptap's keymap
// extension graph per-user and is explicitly out of scope (GAP-logged).

export interface Binding {
  /** Stable id used as the override key and the dispatcher action name. */
  action: string
  /** Normalized default key combo (e.g. `Mod-k`, `Mod-Shift-/`, `f5`). */
  defaultKeys: string
  /** Human-readable label shown in the cheat sheet + settings UI. */
  label: string
  /** Whether the user may remap this binding. */
  customizable: boolean
}

// ── Combo normalization ───────────────────────────────────────────────────────
//
// Canonical form: modifiers in a fixed order joined by `-`, then the key,
// lowercased. `Mod` is the platform-agnostic primary modifier (Cmd on macOS,
// Ctrl elsewhere). Examples:
//   "Cmd+K"        → "Mod-k"
//   "meta+k"       → "Mod-k"
//   "Shift+Cmd+/"  → "Mod-Shift-/"
//   "F5"           → "f5"

// Canonical modifier output order. Mod first, then Shift, then Alt.
const MODIFIER_ORDER = ['Mod', 'Shift', 'Alt'] as const

/** Map a single token to its canonical modifier name, or null if it's not a modifier. */
function canonicalModifier(token: string): (typeof MODIFIER_ORDER)[number] | null {
  const t = token.toLowerCase()
  if (
    t === 'mod' ||
    t === 'cmd' ||
    t === 'command' ||
    t === 'meta' ||
    t === 'ctrl' ||
    t === 'control'
  ) {
    return 'Mod'
  }
  if (t === 'shift') return 'Shift'
  if (t === 'alt' || t === 'option' || t === 'opt') return 'Alt'
  return null
}

/**
 * Canonicalize a key combo string into Parchment's normalized form.
 * Accepts `+` or `-` separators, any modifier casing, and any modifier order.
 * The final (non-modifier) token is the key, lowercased. Idempotent.
 */
export function normalizeCombo(combo: string): string {
  const tokens = combo
    .trim()
    .split(/[+-]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  const mods = new Set<(typeof MODIFIER_ORDER)[number]>()
  let key = ''

  for (const token of tokens) {
    const mod = canonicalModifier(token)
    if (mod) {
      mods.add(mod)
    } else {
      // Last non-modifier token wins as the key.
      key = token.toLowerCase()
    }
  }

  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m))
  return [...orderedMods, key].filter((p) => p.length > 0).join('-')
}

// ── DEFAULT_BINDINGS ──────────────────────────────────────────────────────────
//
// Read from the actual codebase (do not invent):
//   - command-palette: CommandPalette.tsx opens on Cmd/Ctrl + 'k'  → Mod-k
//   - fuzzy-finder:     FileFinder.tsx opens on Cmd/Ctrl + 'p'      → Mod-p
//   - shortcuts-help:   I2 global chord, Cmd/Ctrl + Shift + '/'     → Mod-Shift-/
//   - presenter:        Editor.tsx / PresenterView.tsx toggle on F5 → f5
//
// The read-only reference rows mirror src/lib/help/content.ts SHORTCUTS so the
// cheat sheet stays a complete keyboard reference. These are Tiptap-owned and
// NOT remappable in v0.1 (customizable: false).

export const DEFAULT_BINDINGS: Binding[] = [
  // ── Customizable app-level commands ──
  {
    action: 'command-palette',
    defaultKeys: 'Mod-k',
    label: 'Open command palette',
    customizable: true,
  },
  {
    action: 'fuzzy-finder',
    defaultKeys: 'Mod-p',
    label: 'Fuzzy file finder',
    customizable: true,
  },
  {
    action: 'shortcuts-help',
    defaultKeys: 'Mod-Shift-/',
    label: 'Show keyboard shortcuts',
    customizable: true,
  },
  {
    action: 'presenter',
    defaultKeys: 'f5',
    label: 'Enter / exit presenter mode',
    customizable: true,
  },
  // ── Read-only reference (Tiptap-owned editor formatting; not remappable) ──
  { action: 'bold', defaultKeys: 'Mod-b', label: 'Bold', customizable: false },
  { action: 'italic', defaultKeys: 'Mod-i', label: 'Italic', customizable: false },
  { action: 'underline', defaultKeys: 'Mod-u', label: 'Underline', customizable: false },
  { action: 'undo', defaultKeys: 'Mod-z', label: 'Undo', customizable: false },
  { action: 'redo', defaultKeys: 'Mod-Shift-z', label: 'Redo', customizable: false },
  {
    action: 'clear-formatting',
    defaultKeys: 'Mod-\\',
    label: 'Clear formatting',
    customizable: false,
  },
]

// ── mergeBindings ─────────────────────────────────────────────────────────────

/**
 * Apply user `overrides` (action → raw combo) onto `defaults`. Overrides are
 * honored ONLY for known, customizable bindings; overrides targeting an unknown
 * action or a non-customizable binding are ignored. Returns a new array; the
 * input is never mutated. Override combos are normalized before being applied.
 */
export function mergeBindings(defaults: Binding[], overrides: Record<string, string>): Binding[] {
  return defaults.map((b) => {
    if (!b.customizable) return { ...b }
    const override = overrides[b.action]
    if (typeof override !== 'string' || override.length === 0) return { ...b }
    return { ...b, defaultKeys: normalizeCombo(override) }
  })
}

// ── findConflicts ─────────────────────────────────────────────────────────────

/**
 * Group bindings by normalized combo and return every combo claimed by more
 * than one action. Empty array when there are no collisions.
 */
export function findConflicts(bindings: Binding[]): { keys: string; actions: string[] }[] {
  const byCombo = new Map<string, string[]>()
  for (const b of bindings) {
    const key = normalizeCombo(b.defaultKeys)
    const existing = byCombo.get(key)
    if (existing) {
      existing.push(b.action)
    } else {
      byCombo.set(key, [b.action])
    }
  }

  const conflicts: { keys: string; actions: string[] }[] = []
  for (const [keys, actions] of byCombo) {
    if (actions.length > 1) conflicts.push({ keys, actions })
  }
  return conflicts
}

// ── matchesCombo ──────────────────────────────────────────────────────────────

/** The modifier/key shape we read off a KeyboardEvent (subset, testable). */
export interface ComboEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Does keyboard event `e` match the normalized `combo`? `Mod` matches meta OR
 * ctrl (platform-agnostic). All other modifiers must match exactly — an extra
 * held modifier is a non-match. The key comparison is case-insensitive.
 */
export function matchesCombo(e: ComboEvent, combo: string): boolean {
  const normalized = normalizeCombo(combo)
  const parts = normalized.split('-')
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1))

  const wantsMod = mods.has('Mod')
  const wantsShift = mods.has('Shift')
  const wantsAlt = mods.has('Alt')

  // Mod = meta on mac / ctrl elsewhere — accept either when required, and
  // require neither when not. (We do not distinguish meta vs ctrl: a combo
  // either uses the primary modifier or it does not.)
  const hasMod = e.metaKey || e.ctrlKey
  if (wantsMod !== hasMod) return false
  if (wantsShift !== e.shiftKey) return false
  if (wantsAlt !== e.altKey) return false

  return e.key.toLowerCase() === key
}
