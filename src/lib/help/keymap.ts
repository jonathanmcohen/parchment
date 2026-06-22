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
//   "Mod+-"        → "Mod--"   (the `-` key is bindable, never a separator)
//   "Mod++"        → "Mod-+"   (the `+` key is bindable too)
//
// TOKENIZATION (finding E): `-` and `+` are LEGAL KEYS, so we must not treat
// them as separators that get consumed. We canonically join with `-`, but we
// tokenize by greedily stripping a leading run of KNOWN modifier names (each
// followed by `-` or `+`); whatever remains after the last modifier separator
// is the literal key — even if that key is itself `-` or `+`. This lets
// `Mod+-`, `Mod-+`, `Mod--` all round-trip to a `-`/`+` binding instead of
// collapsing to a modifier-only combo.

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

// Layout-robust punctuation equivalence (finding A). On US/most QWERTY layouts
// Shift transforms the unshifted character (e.g. `/` → `?`), so a chord recorded
// or matched with Shift held delivers the SHIFTED character via KeyboardEvent.key
// while the stored default uses the UNSHIFTED one. We canonicalize every key to
// its UNSHIFTED form so `?` and `/` (etc.) compare equal. The dispatcher then
// only requires the Shift MODIFIER bit to agree — the printed character no longer
// has to. This pairing covers the standard US number row + punctuation keys.
const SHIFTED_TO_UNSHIFTED: Record<string, string> = {
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
}

/**
 * Fold a single key character to its layout-canonical (unshifted) form so the
 * shifted/unshifted pair of the same physical key compares equal. Lowercases
 * letters. Idempotent. Only single printable characters are folded — named keys
 * (F5, Enter, ArrowLeft, …) pass through lowercased unchanged.
 */
export function canonicalKey(key: string): string {
  if (key.length === 1) {
    const unshifted = SHIFTED_TO_UNSHIFTED[key]
    if (unshifted) return unshifted
    return key.toLowerCase()
  }
  return key.toLowerCase()
}

/**
 * Canonicalize a key combo string into Parchment's normalized form.
 * Accepts `+` or `-` as the modifier separator, any modifier casing, and any
 * modifier order. The final token is the literal key, layout-folded to its
 * unshifted form (so `?` → `/`). `-` and `+` are valid keys and are NEVER
 * consumed as separators. Idempotent.
 */
export function normalizeCombo(combo: string): string {
  let rest = combo.trim()
  const mods = new Set<(typeof MODIFIER_ORDER)[number]>()

  // Greedily consume leading modifier tokens. A modifier token is a known
  // modifier name immediately followed by a `-` or `+` separator AND more input.
  // We stop the moment the leading word is not a modifier (then the remainder,
  // separators included, is the literal key — e.g. `-`, `+`, or `--`).
  for (;;) {
    const m = rest.match(/^([A-Za-z]+)[-+](.+)$/)
    if (!m) break
    const word = m[1] ?? ''
    const tail = m[2] ?? ''
    const mod = canonicalModifier(word)
    if (!mod) break
    mods.add(mod)
    rest = tail.trim()
  }

  // Whatever remains is the key. If it's purely a modifier name with no trailing
  // separator (e.g. input was just "Shift"), treat it as a modifier and leave no
  // key — sanitizeOverrides rejects modifier-only combos downstream.
  let key = rest
  const trailingMod = canonicalModifier(rest)
  if (trailingMod) {
    mods.add(trailingMod)
    key = ''
  } else {
    key = canonicalKey(rest)
  }

  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m))
  return [...orderedMods, key].filter((p) => p.length > 0).join('-')
}

/**
 * Split an already-normalized combo into its modifier set and its literal key.
 *
 * A naive `normalized.split('-')` is WRONG when the key itself is `-` (the combo
 * `Mod--` would split to `['Mod','','']` and lose the key) — finding E. We
 * instead peel known leading modifier tokens off the front; whatever remains
 * (including a literal `-` or `+`, or empty for a modifier-only combo) is the
 * key. Use this everywhere a normalized combo needs to be decomposed.
 */
export function splitCombo(normalized: string): { mods: Set<string>; key: string } {
  let rest = normalized
  const mods = new Set<string>()
  for (;;) {
    // A leading modifier in normalized form is one of the canonical capitalized
    // names followed by `-` and more input.
    const m = rest.match(/^(Mod|Shift|Alt)-(.+)$/)
    if (!m) break
    mods.add(m[1] ?? '')
    rest = m[2] ?? ''
  }
  // A trailing bare modifier name (modifier-only combo) has no key.
  if (rest === 'Mod' || rest === 'Shift' || rest === 'Alt') {
    mods.add(rest)
    return { mods, key: '' }
  }
  return { mods, key: rest }
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
  /**
   * Physical key code (e.g. `Slash`, `Digit1`, `Minus`). Optional so tests and
   * non-DOM callers stay terse, but when present it is the MOST layout-robust
   * signal: `code` is unaffected by Shift, so `code === 'Slash'` identifies the
   * `/` key whether the OS reported `key:'/'` or `key:'?'`.
   */
  code?: string
}

// Map a KeyboardEvent.code for a printable punctuation/digit key to its
// layout-canonical (unshifted US) character, so `code` can be compared against
// the stored unshifted key. Named/letter codes are handled separately.
const CODE_TO_UNSHIFTED: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
}

/**
 * Resolve a KeyboardEvent.code to its layout-canonical character, or null when
 * the code does not map to a single stored-key character (letters are handled
 * via `key`; function/navigation codes have no single-char form here).
 */
function unshiftedFromCode(code: string | undefined): string | null {
  if (!code) return null
  const punct = CODE_TO_UNSHIFTED[code]
  if (punct) return punct
  // KeyA…KeyZ → the lowercase letter (layout-robust on QWERTY-family layouts).
  const letter = code.match(/^Key([A-Z])$/)
  if (letter?.[1]) return letter[1].toLowerCase()
  return null
}

/**
 * Does keyboard event `e` match the normalized `combo`? `Mod` matches meta OR
 * ctrl (platform-agnostic). All other modifiers must match exactly — an extra
 * held modifier is a non-match.
 *
 * KEY MATCHING (finding A): the physical `/` key reports `key:'?'` when Shift is
 * held (US layout), so a literal `e.key` comparison against the stored `/` fails
 * and ⌘⇧/ never fires. We match layout-robustly: prefer `e.code` (Shift-immune,
 * e.g. `Slash` ⇒ `/`) when it resolves to a stored-key character, otherwise fold
 * `e.key` to its unshifted form via canonicalKey (`?` ⇒ `/`). Either way the
 * Shift MODIFIER bit must still agree, so ⌘/ and ⌘⇧/ remain distinct combos.
 */
export function matchesCombo(e: ComboEvent, combo: string): boolean {
  const normalized = normalizeCombo(combo)
  // Decompose robustly: a naive split('-') would lose a `-` key (finding E).
  const { mods, key } = splitCombo(normalized)

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

  // Prefer the Shift-immune physical code when it maps to a stored-key char;
  // fall back to the (layout-folded) printed character otherwise.
  const codeKey = unshiftedFromCode(e.code)
  if (codeKey !== null) return codeKey === key
  return canonicalKey(e.key) === key
}
