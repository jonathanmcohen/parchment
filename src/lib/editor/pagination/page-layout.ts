/**
 * Pure layout engine for LIVE paged pagination (companion to break-index.ts).
 *
 * Given the measured raw heights of each top-level block and the page geometry,
 * decide where pages break, how tall each inter-page spacer must be (so content
 * fills a page then resumes atop the next sheet, with the bottom margin always
 * preserved), and the rectangle of every background sheet.
 *
 * DOM-free + side-effect-free so it is deterministically unit-testable. Blocks
 * are ATOMIC: a block is never split across a page boundary; a block taller than
 * a page gets its own, grown sheet.
 */

import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface PageGeometry {
  /** Sheet height minus top+bottom margins (the text area height), px. */
  usableHeight: number
  topMargin: number
  bottomMargin: number
  /** Gap between consecutive sheets, px. */
  gutter: number
  /** Full sheet height, px. */
  pageHeight: number
}

/** A spacer to insert (as a widget decoration) before a top-level block. */
export interface Spacer {
  beforeBlockIndex: number
  height: number
}

/** A background sheet rectangle in the container's coordinate space. */
export interface PageBox {
  top: number
  height: number
  oversized: boolean
}

export interface PageLayout {
  /** Block indices that start a new page (first-block-of-page positions). */
  breakBeforeBlock: number[]
  /** One spacer per break, in block order. */
  spacers: Spacer[]
  /** One rectangle per page, in page order. */
  pageBoxes: PageBox[]
}

/**
 * Greedy first-fit pagination with spacer + sheet-box computation.
 *
 * Break before block i when a manual break is forced there, or when adding block
 * i would push the current page's used height past `usableHeight` (and the page
 * already has content). A block taller than a page therefore lands on its own
 * page and the following block breaks before it — isolating the oversized block.
 *
 * Spacer height for a break ending a page with used height `used`:
 *   (usableHeight - used) + bottomMargin + gutter + topMargin
 * The first term fills the rest of the page's text area (so content stops above
 * the bottom margin); the rest is the inter-sheet trough + next page's top margin.
 */
export function computePageLayout(
  blockHeights: readonly number[],
  forcedBreakBefore: ReadonlySet<number>,
  geo: PageGeometry,
): PageLayout {
  const { usableHeight, topMargin, bottomMargin, gutter, pageHeight } = geo
  const n = blockHeights.length

  if (n === 0) {
    return {
      breakBeforeBlock: [],
      spacers: [],
      pageBoxes: [{ top: 0, height: pageHeight, oversized: false }],
    }
  }

  const breakBeforeBlock: number[] = []
  const pageUsed: number[] = []
  let used = 0

  for (let i = 0; i < n; i++) {
    const h = blockHeights[i] ?? 0
    if (i === 0) {
      used = h
      continue
    }
    const forced = forcedBreakBefore.has(i)
    const overflow = usableHeight > 0 && used + h > usableHeight
    if (forced || overflow) {
      pageUsed.push(used)
      breakBeforeBlock.push(i)
      used = h
    } else {
      used += h
    }
  }
  pageUsed.push(used)

  const spacers: Spacer[] = breakBeforeBlock.map((beforeBlockIndex, k) => {
    const fill = Math.max(0, usableHeight - (pageUsed[k] ?? 0))
    return { beforeBlockIndex, height: fill + bottomMargin + gutter + topMargin }
  })

  const pageBoxes: PageBox[] = []
  let top = 0
  for (const u of pageUsed) {
    const oversized = u > usableHeight
    const height = oversized ? u + topMargin + bottomMargin : pageHeight
    pageBoxes.push({ top, height, oversized })
    top += height + gutter
  }

  return { breakBeforeBlock, spacers, pageBoxes }
}

/**
 * Position (in ProseMirror doc coordinates) immediately before each direct child
 * of the given node. For the top doc, `child offset === absolute position before
 * the child`, so a widget placed at offset[i] with side -1 sits before block i.
 */
export function topLevelBlockOffsets(doc: ProseMirrorNode): number[] {
  const offsets: number[] = []
  doc.forEach((_child, offset) => {
    offsets.push(offset)
  })
  return offsets
}
