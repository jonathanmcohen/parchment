// F3: font-size stepper bounds. The toolbar's −/+ chips and the numeric input
// share ONE clamp so a step can never escape the 1–999 range the <input> also
// enforces. Pure logic — unit-tested; the unit ('pt' | 'px') is preserved by the
// caller, this helper only governs the numeric magnitude.

/** Inclusive lower bound for a font size (matches the numeric input's `min`). */
export const MIN_FONT_SIZE = 1
/** Inclusive upper bound for a font size (matches the numeric input's `max`). */
export const MAX_FONT_SIZE = 999

/** Clamp a font size into the inclusive [1, 999] range. NaN folds to MIN. */
export function clampFontSize(value: number): number {
  if (Number.isNaN(value)) return MIN_FONT_SIZE
  if (value < MIN_FONT_SIZE) return MIN_FONT_SIZE
  if (value > MAX_FONT_SIZE) return MAX_FONT_SIZE
  return Math.trunc(value)
}

/** Step a font size by `delta` (e.g. ∓1) and clamp the result to [1, 999]. */
export function stepFontSize(value: number, delta: number): number {
  return clampFontSize(value + delta)
}
