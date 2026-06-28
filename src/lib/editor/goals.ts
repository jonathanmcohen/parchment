// J10-1: pure writing-goal model. NO db, NO React. Builds on counts.ts (the word
// count is computed there; this module turns (words, target) into progress).
//
// Per-doc target persistence lives in documents.meta.writingGoal = { targetWords }.
// `parseWritingGoal` is the validation boundary for that stored blob (never throws,
// coerces junk to 0 = "no goal"). `goalProgress` is the display math.

export interface WritingGoalProgress {
  /** Whole-number percentage 0–100. 0 when there is no goal. */
  pct: number
  /** Words still needed to hit the target (0 when met or no goal). */
  remaining: number
  /** True once words ≥ target (and a target is set). */
  done: boolean
}

/**
 * Progress toward a word target. A non-positive target means "no goal" → all zeros
 * (never NaN/Infinity). pct is clamped to [0,100] and rounded; remaining is clamped
 * to ≥ 0; done is true exactly when words ≥ target.
 */
export function goalProgress(input: { words: number; targetWords: number }): WritingGoalProgress {
  const words = Number.isFinite(input.words) ? Math.max(0, input.words) : 0
  const target = Number.isFinite(input.targetWords) ? input.targetWords : 0
  if (target <= 0) return { pct: 0, remaining: 0, done: false }
  const ratio = words / target
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)))
  const remaining = Math.max(0, target - words)
  const done = words >= target
  return { pct, remaining, done }
}

/**
 * Validate/normalize the stored per-doc writing goal target (words). Accepts a meta
 * blob like { targetWords: number }; returns a non-negative integer, or 0 ("no
 * goal") for anything missing/malformed/non-positive. NEVER throws.
 */
export function parseWritingGoal(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0
  const t = (raw as { targetWords?: unknown }).targetWords
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return 0
  return Math.round(t)
}
