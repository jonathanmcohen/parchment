// I3: Pure autosave constants and clamp helper — no @/db dependency.
// Imported by both settings-repo.ts (server) and AutosaveSlider.tsx (client).

export const AUTOSAVE_INTERVAL_KEY = 'autosaveIntervalMs'
export const DEFAULT_AUTOSAVE_MS = 30_000
export const MIN_AUTOSAVE_MS = 5_000
export const MAX_AUTOSAVE_MS = 300_000

/** Clamp ms to the valid autosave range [MIN, MAX]. Non-finite → default. */
export function clampAutosaveMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_AUTOSAVE_MS
  return Math.min(MAX_AUTOSAVE_MS, Math.max(MIN_AUTOSAVE_MS, ms))
}
