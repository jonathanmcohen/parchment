/**
 * Pure pagination engine (v0.1.10 #11/#12/#13).
 *
 * These functions take measured block heights and a usable page height and
 * decide where pages break. They are intentionally DOM-free and side-effect-free
 * so they can be unit-tested deterministically — the DOM measurement lives in the
 * paged view component; the *decision* of where to break lives here.
 *
 * "Block" here means a top-level flow block of the document (a paragraph, a
 * heading, a code block, a table, an image, …). We treat each block as ATOMIC:
 * a block is never split across a page boundary. This is a deliberate
 * simplification — splitting a paragraph mid-line would require line-box
 * measurement and is out of scope. A block taller than a full page therefore
 * occupies its own page (and visually overflows the sheet, exactly like a giant
 * image would in a word processor).
 */

/** A single top-level block's measured layout height, in CSS pixels. */
export interface BlockHeight {
  /** Outer height of the block including its own vertical margins, in px. */
  height: number
}

/**
 * Compute the page-break indices for a sequence of atomic block heights.
 *
 * The return value is the list of block indices at which a NEW page begins.
 * Page 1 always starts at block 0 (never returned). A returned index `i` means
 * "block i is the first block of a new page". Therefore:
 *   - `pageCount === breakIndices.length + 1`
 *   - page 1 = blocks [0, breakIndices[0])
 *   - page k = blocks [breakIndices[k-2], breakIndices[k-1])  (1 < k < pageCount)
 *   - last page = blocks [breakIndices.at(-1), heights.length)
 *
 * Algorithm (greedy, first-fit):
 *   Walk blocks in order, accumulating the current page's used height. Adding a
 *   block that would push the used height past `usablePageHeight` starts a new
 *   page *before* that block. A block that does not fit even on an empty page
 *   (taller than a full page) gets its own page and we continue from the next
 *   block.
 *
 * Edge cases:
 *   - empty input → `[]` (one empty page)
 *   - `usablePageHeight <= 0` → `[]` (cannot paginate; caller renders one page)
 *   - zero-height blocks never force a break on their own
 *
 * Examples (usablePageHeight = 1000):
 *   [400,400,400]           → [2]        (pages: [0,1] | [2])
 *   [1000,1000]             → [1]        (each block exactly fills a page)
 *   [600,600,600,600]       → [1,2,3]    (each pair would be 1200 > 1000)
 *   [1500]                  → []          (single oversized block, one page)
 *   [300,1500,300]          → [1,2]      (oversized block isolated on its own page)
 */
export function computeBreakIndices(
  heights: readonly BlockHeight[],
  usablePageHeight: number,
): number[] {
  if (usablePageHeight <= 0) return []
  if (heights.length === 0) return []

  const breaks: number[] = []
  let used = 0

  for (let i = 0; i < heights.length; i++) {
    const blockHeight = heights[i]?.height ?? 0

    // First block of the document never starts a break.
    if (i === 0) {
      used = blockHeight
      continue
    }

    if (used + blockHeight > usablePageHeight) {
      // Adding this block overflows the current page → it starts a new page.
      breaks.push(i)
      used = blockHeight
    } else {
      used += blockHeight
    }
  }

  return breaks
}

/**
 * Variable-height variant of `computeBreakIndices`: each page may have a
 * DIFFERENT usable height (needed for per-page orientation — a landscape page is
 * shorter than its portrait neighbours).
 *
 * `usableForPage(pageIndex)` returns the usable content height (px) for the
 * 0-based page index. Semantics otherwise match `computeBreakIndices`: greedy
 * first-fit, atomic blocks, an oversized block keeps its own page, the returned
 * indices are the first-block-of-each-new-page positions.
 *
 * A page whose usable height is `<= 0` is treated as "do not break here" so a
 * degenerate page size can never produce an infinite page run.
 *
 * When `usableForPage` returns the same constant for every page, the output is
 * identical to `computeBreakIndices(heights, thatConstant)`.
 */
export function computeBreakIndicesVariable(
  heights: readonly BlockHeight[],
  usableForPage: (pageIndex: number) => number,
): number[] {
  if (heights.length === 0) return []

  const breaks: number[] = []
  let pageIndex = 0
  let used = 0

  for (let i = 0; i < heights.length; i++) {
    const blockHeight = heights[i]?.height ?? 0

    if (i === 0) {
      used = blockHeight
      continue
    }

    const usable = usableForPage(pageIndex)
    if (usable <= 0) {
      // Degenerate page height — accumulate without breaking (keeps everything on
      // the current page) rather than risk an unbounded page count.
      used += blockHeight
      continue
    }

    if (used + blockHeight > usable) {
      breaks.push(i)
      pageIndex += 1
      used = blockHeight
    } else {
      used += blockHeight
    }
  }

  return breaks
}

/**
 * Group a flat list of block indices into per-page index ranges given the
 * break indices from `computeBreakIndices`.
 *
 * Returns an array of pages, each a `{ start, end }` half-open range into the
 * original block array (`blocks.slice(start, end)`). Always returns at least one
 * page (possibly empty, for an empty document) so the renderer can emit a blank
 * sheet rather than nothing.
 *
 * Example: totalBlocks=4, breakIndices=[2] →
 *   [ { start: 0, end: 2 }, { start: 2, end: 4 } ]
 */
export function pagesFromBreaks(
  totalBlocks: number,
  breakIndices: readonly number[],
): Array<{ start: number; end: number }> {
  if (totalBlocks <= 0) return [{ start: 0, end: 0 }]

  // Sanitise: only in-range, strictly-increasing breaks (defensive — the engine
  // already produces these, but a caller could pass arbitrary input).
  const clean: number[] = []
  let prev = 0
  for (const b of breakIndices) {
    if (b > prev && b < totalBlocks) {
      clean.push(b)
      prev = b
    }
  }

  const pages: Array<{ start: number; end: number }> = []
  let start = 0
  for (const b of clean) {
    pages.push({ start, end: b })
    start = b
  }
  pages.push({ start, end: totalBlocks })
  return pages
}
