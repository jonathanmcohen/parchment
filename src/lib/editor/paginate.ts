export type PageSize = 'Letter' | 'A4' | 'Legal' | 'Tabloid'
export type Orientation = 'portrait' | 'landscape'

// Page dimensions at 96 dpi, portrait orientation.
const PORTRAIT_DIMS: Record<PageSize, { widthPx: number; heightPx: number }> = {
  Letter: { widthPx: 816, heightPx: 1056 },
  A4: { widthPx: 794, heightPx: 1123 },
  Legal: { widthPx: 816, heightPx: 1344 },
  Tabloid: { widthPx: 1056, heightPx: 1632 },
}

/** Return pixel dimensions of the given page size at 96 dpi. */
export function pageDims(
  size: PageSize,
  orientation: Orientation = 'portrait',
): {
  widthPx: number
  heightPx: number
} {
  const { widthPx, heightPx } = PORTRAIT_DIMS[size]
  if (orientation === 'landscape') {
    return { widthPx: heightPx, heightPx: widthPx }
  }
  return { widthPx, heightPx }
}

/**
 * Return the Y-offsets (px) at which new pages begin.
 * The first page starts at 0 — breaks are where the *next* page starts.
 * Returns `pageCount - 1` evenly-spaced offsets at multiples of pageHeightPx.
 * `measurePageBreaks(2000, 1056)` → `[1056]`
 * `measurePageBreaks(3200, 1056)` → `[1056, 2112, 3168]`
 * `measurePageBreaks(1000, 1056)` → `[]`
 */
export function measurePageBreaks(contentHeightPx: number, pageHeightPx: number): number[] {
  const n = pageCount(contentHeightPx, pageHeightPx)
  const breaks: number[] = []
  for (let i = 1; i < n; i++) {
    breaks.push(i * pageHeightPx)
  }
  return breaks
}

/**
 * Total page count; always at least 1. Any content past a page boundary lands
 * on the next page, so this is a ceiling: content of height 3200 with 1056-px
 * pages occupies 4 pages (3·1056 = 3168 < 3200).
 */
export function pageCount(contentHeightPx: number, pageHeightPx: number): number {
  return Math.max(1, Math.ceil(contentHeightPx / pageHeightPx))
}
