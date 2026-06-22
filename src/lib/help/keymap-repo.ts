// I2 — server-side persistence for customizable shortcut overrides.
//
// Overrides are stored in the existing E11 settings key-value store (no
// migration) under a single key, as a Record<action, normalizedCombo>. Only
// known customizable actions are accepted; invalid combos are dropped at the
// validation boundary so the stored map is always clean.
//
// CONSTRAINT: server-only — imports @/db via settings-repo. The client never
// imports this module; it reads/writes through GET/PUT /api/settings/shortcuts.

import { getSetting, setSetting } from '@/lib/docs/settings-repo'
import { DEFAULT_BINDINGS, normalizeCombo } from '@/lib/help/keymap'

export const SHORTCUT_OVERRIDES_KEY = 'shortcutOverrides'

/** Set of action ids that the user is allowed to remap. */
const CUSTOMIZABLE_ACTIONS = new Set(
  DEFAULT_BINDINGS.filter((b) => b.customizable).map((b) => b.action),
)

/**
 * Validate + normalize a raw overrides map. Keeps only entries whose action is a
 * known customizable binding and whose combo normalizes to a non-empty form with
 * an actual key (a combo of modifiers only is rejected). Returns a clean map.
 */
export function sanitizeOverrides(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [action, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!CUSTOMIZABLE_ACTIONS.has(action)) continue
    if (typeof value !== 'string') continue
    const normalized = normalizeCombo(value)
    // Reject empty or modifier-only combos (must have a real key as the last
    // part). normalizeCombo lowercases the real key but keeps modifier names
    // capitalized (Mod / Shift / Alt), so a modifier-only combo ends in one of
    // those capitalized tokens.
    const parts = normalized.split('-')
    const key = parts[parts.length - 1] ?? ''
    if (key.length === 0) continue
    if (key === 'Mod' || key === 'Shift' || key === 'Alt') continue
    out[action] = normalized
  }
  return out
}

/** Read the owner's shortcut overrides (validated; never throws). */
export async function getShortcutOverrides(ownerId: string): Promise<Record<string, string>> {
  const raw = await getSetting<unknown>(ownerId, SHORTCUT_OVERRIDES_KEY, {})
  return sanitizeOverrides(raw)
}

/** Persist the owner's shortcut overrides (validated via normalizeCombo; invalid dropped). */
export async function setShortcutOverrides(
  ownerId: string,
  overrides: unknown,
): Promise<Record<string, string>> {
  const clean = sanitizeOverrides(overrides)
  await setSetting(ownerId, SHORTCUT_OVERRIDES_KEY, clean)
  return clean
}
