/**
 * Per-page orientation model (v0.1.10 #11).
 *
 * The base `PageSetup` (size + margins + a document-default orientation) lives in
 * `@/lib/editor/paginate`. For TRUE pagination we additionally allow each page to
 * override the orientation independently — e.g. a wide table on page 3 can be
 * landscape while the rest of the document is portrait.
 *
 * This module is pure (no DOM, no React) so the geometry can be unit-tested. It
 * resolves, for any page orientation, the outer sheet box and the usable content
 * box (sheet minus margins) used by the paginator and the renderer.
 */

import { type Orientation, type PageSetup, resolvePageDims } from '@/lib/editor/paginate'

/**
 * A per-page orientation override list, indexed by page number (0-based).
 *
 * `orientations[i]` is the orientation of page i+1. A missing / undefined entry
 * (or an out-of-range index) means "inherit the document default" — so the array
 * is sparse-friendly and never needs to match the page count exactly. This keeps
 * the persisted shape small (only pages the user actually flipped are stored).
 */
export type PageOrientations = ReadonlyArray<Orientation | undefined>

/** Outer sheet dimensions (px) for a page. */
export interface SheetBox {
  widthPx: number
  heightPx: number
}

/** Usable content box (px) = sheet minus margins, floored at 0. */
export interface ContentBox {
  widthPx: number
  heightPx: number
}

/**
 * Resolve the OUTER sheet dimensions for a single page at the given orientation.
 *
 * Starts from the document's PageSetup but forces the supplied orientation. The
 * size (Letter/A4/Custom/…) and the portrait base dimensions come from the
 * setup; only the orientation is overridden. This is what lets one page be
 * landscape while its neighbours stay portrait.
 */
export function sheetBoxFor(setup: PageSetup, orientation: Orientation): SheetBox {
  return resolvePageDims({
    size: setup.size,
    orientation,
    widthPx: setup.widthPx,
    heightPx: setup.heightPx,
  })
}

/**
 * Resolve the USABLE CONTENT box (sheet minus margins) for a single page at the
 * given orientation. Margins are taken from the setup verbatim and applied to
 * whichever orientation the page uses (Word keeps the same physical margins when
 * a single page is flipped; the content area just gets wider + shorter).
 *
 * Both dimensions are floored at 0 so pathological margins (larger than the
 * sheet) never produce negative usable space.
 */
export function contentBoxFor(setup: PageSetup, orientation: Orientation): ContentBox {
  const sheet = sheetBoxFor(setup, orientation)
  const { margins } = setup
  return {
    widthPx: Math.max(0, sheet.widthPx - margins.left - margins.right),
    heightPx: Math.max(0, sheet.heightPx - margins.top - margins.bottom),
  }
}

/**
 * The orientation a given page uses: its override if present, else the document
 * default from the PageSetup. `pageIndex` is 0-based.
 */
export function orientationForPage(
  setup: PageSetup,
  orientations: PageOrientations,
  pageIndex: number,
): Orientation {
  const override = pageIndex >= 0 ? orientations[pageIndex] : undefined
  return override ?? setup.orientation
}

/**
 * Toggle (or set) a single page's orientation in an immutable override list,
 * returning a NEW list. Passing `next` flips between portrait/landscape relative
 * to whatever the page currently resolves to; passing an explicit orientation
 * sets it directly.
 *
 * To keep the persisted list minimal, an override that equals the document
 * default is stored as `undefined` (inherit) rather than a redundant literal —
 * EXCEPT we still write the literal when it differs from the default. The array
 * is grown with `undefined` holes as needed so indexing stays correct.
 */
export function setPageOrientation(
  setup: PageSetup,
  orientations: PageOrientations,
  pageIndex: number,
  next: Orientation,
): Array<Orientation | undefined> {
  const out: Array<Orientation | undefined> = orientations.slice()
  // Grow with inherit-holes up to pageIndex.
  while (out.length <= pageIndex) out.push(undefined)
  // Store only meaningful overrides; collapse default back to inherit so the
  // list stays sparse and the persisted shape small.
  out[pageIndex] = next === setup.orientation ? undefined : next
  return out
}
