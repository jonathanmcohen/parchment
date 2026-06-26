/**
 * Pure pagination engine barrel (v0.1.10 #11/#12/#13).
 *
 * Re-exports the DOM-free break-index + per-page-orientation geometry so callers
 * import from a single stable path. The DOM measurement + React rendering live in
 * the paged view component, not here.
 */

export {
  type BlockHeight,
  computeBreakIndices,
  pagesFromBreaks,
} from '@/lib/editor/pagination/break-index'
export {
  type ContentBox,
  contentBoxFor,
  orientationForPage,
  type PageOrientations,
  type SheetBox,
  setPageOrientation,
  sheetBoxFor,
} from '@/lib/editor/pagination/page-model'
