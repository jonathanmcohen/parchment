// ── Page number formatting ────────────────────────────────────────────────

export type PageNumberFormat = 'none' | '1' | 'i' | 'I' | 'a' | 'A'

/**
 * Format a 1-based page number according to the given format:
 *   '1'  → decimal ('1', '2', '3', …)
 *   'i'  → lower-case roman ('i', 'ii', 'iii', 'iv', …)
 *   'I'  → upper-case roman ('I', 'II', 'III', 'IV', …)
 *   'a'  → lower-case alpha ('a'…'z', 'aa', 'ab', …)
 *   'A'  → upper-case alpha ('A'…'Z', 'AA', 'AB', …)
 *   'none' → '' (page numbers suppressed)
 */
export function formatPageNumber(n: number, format: PageNumberFormat): string {
  switch (format) {
    case 'none':
      return ''
    case '1':
      return String(n)
    case 'i':
      return toRoman(n).toLowerCase()
    case 'I':
      return toRoman(n)
    case 'a':
      return toAlpha(n, 'lower')
    case 'A':
      return toAlpha(n, 'upper')
  }
}

// ── Roman numeral helper ──────────────────────────────────────────────────

const ROMAN_VALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

function toRoman(n: number): string {
  let remaining = n
  let result = ''
  for (const [val, sym] of ROMAN_VALS) {
    while (remaining >= val) {
      result += sym
      remaining -= val
    }
  }
  return result
}

// ── Alpha helper ──────────────────────────────────────────────────────────

/**
 * Convert 1-based n to alphabetic label.
 * 1→a, 2→b, …, 26→z, 27→aa, 28→ab, …
 * This is bijective base-26: there is no 'a' = 0 slot; 'aa' follows 'z'.
 */
function toAlpha(n: number, casing: 'lower' | 'upper'): string {
  const base = casing === 'lower' ? 97 : 65 // char code for 'a' or 'A'
  let result = ''
  let remaining = n
  while (remaining > 0) {
    remaining-- // shift to 0-based for this digit
    result = String.fromCharCode(base + (remaining % 26)) + result
    remaining = Math.floor(remaining / 26)
  }
  return result
}

// ── Break merging ─────────────────────────────────────────────────────────

/** A manual page-break position (doc offset in pixels). */
export interface ManualBreak {
  pos: number
}

/**
 * Merge automatic page-break offsets (px) with manual page-break offsets (px)
 * into a single sorted, deduplicated list of page-boundary offsets.
 *
 * Example: mergeBreaks([1056, 2112], [500]) → [500, 1056, 2112]
 */
export function mergeBreaks(autoOffsetsPx: number[], manualOffsetsPx: number[]): number[] {
  const set = new Set<number>([...autoOffsetsPx, ...manualOffsetsPx])
  return Array.from(set).sort((a, b) => a - b)
}

// ── Section config ────────────────────────────────────────────────────────

export type PageNumberPosition = 'left' | 'center' | 'right'

/**
 * Per-section page configuration.  Stored in sectionBreak node attrs and as a
 * doc-level default in the PageCanvas context.
 *
 * G9: `watermark` is optional — when present it overrides the doc-level default
 * for all pages governed by this section. When absent, the doc-level default is used.
 */
export interface SectionConfig {
  headerText: string
  footerText: string
  pageNumberFormat: PageNumberFormat
  pageNumberPosition: PageNumberPosition
  /** G9: optional per-section watermark override. Undefined = inherit doc default. */
  watermark?: import('./watermark').WatermarkConfig
}

/** Document-level default section config (applied before the first section break). */
export const DEFAULT_SECTION_CONFIG: SectionConfig = {
  headerText: '',
  footerText: '',
  pageNumberFormat: '1',
  pageNumberPosition: 'center',
  // watermark is intentionally omitted → undefined → inherit doc default
}
