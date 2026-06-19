import { pageCount } from '@/lib/editor/paginate'

/**
 * Return the 1-based page number that a heading at `offsetTopPx` falls on.
 * Uses the same ceiling arithmetic as paginate.pageCount so page boundaries
 * are consistent with the page-break overlays rendered in B1.
 *
 * headingPage(0,    1056) === 1  — top of first page
 * headingPage(1100, 1056) === 2  — just past the first break
 * headingPage(2200, 1056) === 3  — into the third page
 */
export function headingPage(offsetTopPx: number, pageHeightPx: number): number {
  // Add 1 so that an element sitting exactly at a page boundary (e.g. 1056)
  // counts as the next page, matching visual pagination.
  return pageCount(offsetTopPx + 1, pageHeightPx)
}
