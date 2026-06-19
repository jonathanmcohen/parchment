'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_SECTION_CONFIG,
  formatPageNumber,
  mergeBreaks,
  type PageNumberFormat,
  type PageNumberPosition,
  type SectionConfig,
} from '@/lib/editor/page-primitives'
import type { PageSize } from '@/lib/editor/paginate'
import { pageCount as computePageCount, measurePageBreaks, pageDims } from '@/lib/editor/paginate'

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  size: PageSize
  children: React.ReactNode
  onPageCountChange?: (n: number) => void
  /** When provided, the canvas reads manual page breaks and section config from the doc. */
  editor?: Editor | null
}

/** Doc-level info extracted from the editor state. */
interface DocBreakInfo {
  /** Positions (ProseMirror doc pos) of pageBreak nodes in document order. */
  pageBreakPositions: number[]
  /** Section configs in document order, each paired with its doc pos. */
  sectionEntries: Array<{ pos: number; config: SectionConfig }>
}

// ── Pure helper: resolve section config for a page region ─────────────────

/**
 * Given a list of section-break entries (sorted by doc position) and the pixel
 * offset of the break *above* this page region (i.e., where this page starts),
 * determine the active SectionConfig.
 *
 * Because we don't have a direct mapping from doc-pos → px (the DOM positions
 * are only available for pageBreak nodes whose DOM elements we query), we map
 * section break positions by their *index* among all breaks.
 *
 * Strategy: section breaks are inserted before the content they govern, so the
 * section whose dom offsetTop is ≤ the page-start offset is the active one.
 * We use the pixel offsets of all breaks (combined list) to determine this.
 *
 * Simplified approach: for each page region starting at `pageStartPx`, the
 * active section is the last sectionBreak whose px offset is ≤ pageStartPx.
 * We pass the per-break px offsets for section breaks from the DOM query.
 */
function resolveSection(
  sectionEntries: Array<{ pos: number; config: SectionConfig; pxOffset: number }>,
  pageStartPx: number,
): SectionConfig {
  let active: SectionConfig = DEFAULT_SECTION_CONFIG
  for (const entry of sectionEntries) {
    if (entry.pxOffset <= pageStartPx) {
      active = entry.config
    }
  }
  return active
}

// ── Component ──────────────────────────────────────────────────────────────

export function PageCanvas({ size, children, onPageCountChange, editor }: Props) {
  const { widthPx, heightPx } = pageDims(size)
  const contentRef = useRef<HTMLDivElement>(null)
  const [autoBreaks, setAutoBreaks] = useState<number[]>([])

  // ── Extract doc-level break info from editor state (reactive) ─────────
  const docBreakInfo = useEditorState({
    editor: editor ?? null,
    selector: (ctx): DocBreakInfo => {
      if (!ctx.editor) return { pageBreakPositions: [], sectionEntries: [] }
      const pageBreakPositions: number[] = []
      const sectionEntries: Array<{ pos: number; config: SectionConfig }> = []
      ctx.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'pageBreak') {
          pageBreakPositions.push(pos)
        }
        if (node.type.name === 'sectionBreak') {
          sectionEntries.push({
            pos,
            config: {
              headerText: String(node.attrs.headerText ?? ''),
              footerText: String(node.attrs.footerText ?? ''),
              pageNumberFormat: (node.attrs.pageNumberFormat as PageNumberFormat) ?? '1',
              pageNumberPosition: (node.attrs.pageNumberPosition as PageNumberPosition) ?? 'center',
            },
          })
        }
        return true
      })
      return { pageBreakPositions, sectionEntries }
    },
  })

  const pageBreakPositions = docBreakInfo?.pageBreakPositions ?? []
  const sectionEntries = docBreakInfo?.sectionEntries ?? []

  // Stable change-detection key for the DOM-measurement effect.
  // We serialize the relevant reactive values to a string so the effect dep
  // array is a single primitive — this avoids stale-closure issues and
  // also avoids infinite-re-run from new array references each render.
  const domMeasureKey = useMemo(
    () => `${pageBreakPositions.join(',')}|${sectionEntries.length}|${autoBreaks.join(',')}`,
    [pageBreakPositions, sectionEntries.length, autoBreaks],
  )

  // ── ResizeObserver: compute automatic breaks from content height ────────
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const update = () => {
      const h = el.scrollHeight
      const newBreaks = measurePageBreaks(h, heightPx)
      setAutoBreaks(newBreaks)
      onPageCountChange?.(computePageCount(h, heightPx))
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [heightPx, onPageCountChange])

  // ── DOM query: resolve manual page-break px offsets ────────────────────
  // We read the offsetTop of each [data-page-break] DOM node within the content
  // div to get their pixel positions.
  const [manualBreakOffsets, setManualBreakOffsets] = useState<number[]>([])
  const [sectionPxEntries, setSectionPxEntries] = useState<
    Array<{ pos: number; config: SectionConfig; pxOffset: number }>
  >([])

  // Use a ref to always have the latest sectionEntries without it being a dep.
  const sectionEntriesRef = useRef(sectionEntries)
  sectionEntriesRef.current = sectionEntries

  useEffect(() => {
    // domMeasureKey drives re-runs when pageBreak/sectionBreak positions change.
    // It is intentionally referenced here (not just in the dep array) so Biome
    // recognises it as a genuine dependency.
    void domMeasureKey

    const el = contentRef.current
    if (!el) return

    // Measure pageBreak DOM nodes — offsetTop relative to the content div
    const pbNodes = Array.from(el.querySelectorAll<HTMLElement>('[data-page-break]'))
    const manualOffsets = pbNodes.map((node) => {
      let top = 0
      let cur: HTMLElement | null = node
      while (cur && cur !== el) {
        top += cur.offsetTop
        cur = cur.offsetParent as HTMLElement | null
      }
      return top
    })
    setManualBreakOffsets(manualOffsets)

    // Measure sectionBreak DOM nodes
    const sbNodes = Array.from(el.querySelectorAll<HTMLElement>('[data-section-break]'))
    const sbEntries = sectionEntriesRef.current
      .map((entry, i) => {
        const domNode = sbNodes[i]
        if (!domNode) return null
        let top = 0
        let cur: HTMLElement | null = domNode
        while (cur && cur !== el) {
          top += cur.offsetTop
          cur = cur.offsetParent as HTMLElement | null
        }
        return { ...entry, pxOffset: top }
      })
      .filter((e): e is { pos: number; config: SectionConfig; pxOffset: number } => e !== null)
    setSectionPxEntries(sbEntries)
  }, [domMeasureKey])

  // ── Merge auto + manual breaks into final boundary list ─────────────────
  const allBreaks = mergeBreaks(autoBreaks, manualBreakOffsets)

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: widthPx }} className="parchment-page mx-auto">
      {/* Page-boundary overlays — decorative, aria-hidden */}
      {allBreaks.map((offset, i) => {
        // This boundary separates page i+1 (above) from page i+2 (below)
        const pageAbove = i + 1 // 1-based page number above this break
        const pageBelow = i + 2 // 1-based page number below this break

        // The page above starts after the previous break (or at 0)
        const pageAboveStartPx = i === 0 ? 0 : (allBreaks[i - 1] ?? 0)
        // The page below starts at this break
        const pageBelowStartPx = offset

        const sectionAbove = resolveSection(sectionPxEntries, pageAboveStartPx)
        const sectionBelow = resolveSection(sectionPxEntries, pageBelowStartPx)

        const pageNumStr = formatPageNumber(pageAbove, sectionAbove.pageNumberFormat)

        return (
          <div
            key={offset}
            aria-hidden="true"
            style={{ top: offset }}
            className="parchment-page-boundary"
          >
            {/* Footer of the page above: running footer + page number */}
            <div
              className={`parchment-running-footer parchment-pn-${sectionAbove.pageNumberPosition}`}
            >
              {sectionAbove.footerText && (
                <span className="parchment-running-footer-text">{sectionAbove.footerText}</span>
              )}
              {pageNumStr && <span className="parchment-page-number">{pageNumStr}</span>}
            </div>

            {/* Divider line */}
            <div className="parchment-page-divider">
              <span className="parchment-page-divider-label">Page {pageBelow}</span>
            </div>

            {/* Header of the page below: running header */}
            {sectionBelow.headerText && (
              <div className="parchment-running-header">
                <span className="parchment-running-header-text">{sectionBelow.headerText}</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Content wrapper — measured by ResizeObserver */}
      <div ref={contentRef} className="parchment-page-content">
        {children}
      </div>
    </div>
  )
}
