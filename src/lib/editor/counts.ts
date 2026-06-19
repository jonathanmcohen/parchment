export interface Counts {
  words: number
  chars: number
}

const DEFAULT_WPM = 238

/**
 * Count words and raw characters in a string.
 * - words: number of non-empty whitespace-delimited tokens
 * - chars: raw string length (including spaces)
 */
export function countText(text: string): Counts {
  if (text.length === 0) return { words: 0, chars: 0 }
  const tokens = text.split(/\s+/).filter((t) => t.length > 0)
  return { words: tokens.length, chars: text.length }
}

/**
 * Estimate reading time in whole minutes.
 * Returns 0 when words === 0, otherwise ceil(words / wpm) with a floor of 1.
 */
export function readingTimeMinutes(words: number, wpm = DEFAULT_WPM): number {
  if (words === 0) return 0
  return Math.max(1, Math.ceil(words / wpm))
}
