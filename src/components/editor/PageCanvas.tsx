'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { WatermarkLayer } from '@/components/editor/WatermarkLayer'
import {
  DEFAULT_SECTION_CONFIG,
  formatPageNumber,
  mergeBreaks,
  type PageNumberFormat,
  type PageNumberPosition,
  type SectionConfig,
} from '@/lib/editor/page-primitives'
import {
  pageCount as computePageCount,
  DEFAULT_PAGE_SETUP,
  measurePageBreaks,
  type PageSetup,
  resolvePageDims,
} from '@/lib/editor/paginate'
import {
  computePageLayout,
  type PageBox,
  type PageGeometry,
  topLevelBlockOffsets,
} from '@/lib/editor/pagination'
import { DEFAULT_WATERMARK, parseWatermark, type WatermarkConfig } from '@/lib/editor/watermark'

/** Inter-sheet gutter (matches .parchment-paged-root gap in pagination.css). */
const GUTTER_PX = 24

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  /** Full page setup (size, orientation, margins). Falls back to DEFAULT_PAGE_SETUP. */
  pageSetup?: PageSetup
  children: React.ReactNode
  onPageCountChange?: (n: number) => void
  /** When provided, the canvas reads manual page breaks and section config from the doc. */
  editor?: Editor | null
  /** G9: doc-level watermark default. Per-section overrides take precedence when set. */
  watermark?: WatermarkConfig
  /** v0.1.5: workspace page-layout mode — 'paged' renders stronger sheet-edge boundaries. */
  pageLayoutMode?: 'continuous' | 'paged'
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

export function PageCanvas({
  pageSetup = DEFAULT_PAGE_SETUP,
  children,
  onPageCountChange,
  editor,
  watermark = DEFAULT_WATERMARK,
  pageLayoutMode = 'continuous',
}: Props) {
  const { widthPx, heightPx } = resolvePageDims(pageSetup)
  const { margins } = pageSetup
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
          // G9: pull watermark override from section attrs if present (undefined = inherit doc default).
          // Use parseWatermark to validate/clamp all fields rather than a bare cast, so malformed or
          // partial objects (from older schema versions or crafted by collaborators) get clamped to
          // safe defaults instead of being passed through unvalidated.
          const sectionWatermark =
            node.attrs.watermark !== null && node.attrs.watermark !== undefined
              ? parseWatermark(node.attrs.watermark)
              : undefined
          sectionEntries.push({
            pos,
            config: {
              headerText: String(node.attrs.headerText ?? ''),
              footerText: String(node.attrs.footerText ?? ''),
              pageNumberFormat: (node.attrs.pageNumberFormat as PageNumberFormat) ?? '1',
              pageNumberPosition: (node.attrs.pageNumberPosition as PageNumberPosition) ?? 'center',
              ...(sectionWatermark !== undefined ? { watermark: sectionWatermark } : {}),
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
    if (pageLayoutMode === 'paged') return
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
  }, [heightPx, onPageCountChange, pageLayoutMode])

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

  // Keep a stable ref to onPageCountChange so the paged effect doesn't
  // re-attach its ResizeObserver/listeners when the parent passes a new
  // callback identity on every render.
  const onPageCountChangeRef = useRef(onPageCountChange)
  onPageCountChangeRef.current = onPageCountChange

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

  // ── Paged mode: measure block heights, run layout engine, push spacers ──
  const paged = pageLayoutMode === 'paged'
  const [pageBoxes, setPageBoxes] = useState<PageBox[]>([])
  // The spacer heights we last pushed, keyed by beforeBlockIndex, so the next
  // measurement can subtract them and recover spacer-free raw block heights.
  const spacerByIndexRef = useRef<Map<number, number>>(new Map())
  // Signature of the last pageBoxes we pushed, so we skip redundant setState
  // calls when the layout hasn't changed between debounced measurement cycles.
  const pageBoxesSigRef = useRef<string>('')

  useEffect(() => {
    if (!paged || !editor) {
      // Leaving paged mode: clear any spacers so continuous mode is pristine.
      if (editor) editor.commands.setPaginationSpacers([])
      setPageBoxes([])
      spacerByIndexRef.current = new Map()
      return
    }

    const geo: PageGeometry = {
      usableHeight: Math.max(0, heightPx - margins.top - margins.bottom),
      topMargin: margins.top,
      bottomMargin: margins.bottom,
      gutter: GUTTER_PX,
      pageHeight: heightPx,
    }

    let timer: ReturnType<typeof setTimeout> | null = null
    let raf = 0

    const measureAndPaginate = () => {
      const view = editor.view
      const doc = view.state.doc
      const offsets = topLevelBlockOffsets(doc)
      if (offsets.length === 0) {
        setPageBoxes([{ top: 0, height: heightPx, oversized: false }])
        editor.commands.setPaginationSpacers([])
        spacerByIndexRef.current = new Map()
        // Reset the signature sentinel so a subsequent real layout always applies.
        pageBoxesSigRef.current = ''
        onPageCountChangeRef.current?.(1)
        return
      }

      // Measure with offsetTop/offsetHeight (layout px), NOT getBoundingClientRect:
      // the editor renders inside a transform: scale(var(--page-scale)) host, and
      // rect coords are scaled — which would shrink all heights and defeat
      // pagination. Top-level blocks are direct children of view.dom, so they
      // share one offsetParent and their offsetTops are directly comparable.
      const tops: number[] = []
      let lastNode: HTMLElement | null = null
      for (const pos of offsets) {
        const node = view.nodeDOM(pos)
        if (node instanceof HTMLElement) {
          tops.push(node.offsetTop)
          lastNode = node
        } else {
          tops.push(0)
        }
      }
      const contentBottom = lastNode
        ? lastNode.offsetTop + lastNode.offsetHeight
        : view.dom.scrollHeight

      // Raw (spacer-free) height of each block: slot delta minus any spacer we
      // currently have inserted before the NEXT block.
      const prevSpacers = spacerByIndexRef.current
      const rawHeights: number[] = []
      for (let i = 0; i < offsets.length; i++) {
        const top = tops[i] ?? 0
        const nextTop = i + 1 < offsets.length ? (tops[i + 1] ?? top) : contentBottom
        const spacerBeforeNext = i + 1 < offsets.length ? (prevSpacers.get(i + 1) ?? 0) : 0
        rawHeights.push(Math.max(0, nextTop - top - spacerBeforeNext))
      }

      // Manual page breaks → forced break before the following block.
      const forced = new Set<number>()
      doc.forEach((node, _offset, index) => {
        if (node.type.name === 'pageBreak' && index + 1 < offsets.length) forced.add(index + 1)
      })

      const layout = computePageLayout(rawHeights, forced, geo)

      // Idempotency guard: only push spacers if they changed.
      const nextMap = new Map<number, number>()
      for (const s of layout.spacers) nextMap.set(s.beforeBlockIndex, s.height)
      const changed =
        nextMap.size !== prevSpacers.size || [...nextMap].some(([k, v]) => prevSpacers.get(k) !== v)
      if (changed) {
        spacerByIndexRef.current = nextMap
        editor.commands.setPaginationSpacers(layout.spacers)
      }

      // Guard: only update state when the page layout actually changed.
      const sig = layout.pageBoxes.map((b) => `${b.top}:${b.height}:${b.oversized}`).join('|')
      if (sig !== pageBoxesSigRef.current) {
        pageBoxesSigRef.current = sig
        setPageBoxes(layout.pageBoxes)
        onPageCountChangeRef.current?.(layout.pageBoxes.length)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(measureAndPaginate)
        })
      }, 200)
    }

    schedule()
    editor.on('update', schedule)
    const ro = new ResizeObserver(schedule)
    if (contentRef.current) ro.observe(contentRef.current)
    // Re-measure when images finish loading (their height is 0 until then).
    const imgs = Array.from(editor.view.dom.querySelectorAll('img'))
    for (const img of imgs)
      if (!img.complete) img.addEventListener('load', schedule, { once: true })

    return () => {
      if (timer) clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      editor.off('update', schedule)
      ro.disconnect()
    }
  }, [paged, editor, heightPx, margins.top, margins.bottom])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: widthPx,
        paddingTop: margins.top,
        paddingRight: margins.right,
        paddingBottom: margins.bottom,
        paddingLeft: margins.left,
        position: 'relative',
        // Paged mode trough: page-scoped gutter (dark pages darken their own
        // trough via DARK_PAGE_VARS' --page-gutter), falling back to the chrome
        // gutter for light/sepia/custom pages and the normal scheme.
        ...(paged ? { background: 'var(--page-gutter, var(--editor-gutter))' } : {}),
      }}
      className="parchment-page mx-auto"
      data-page-layout={pageLayoutMode}
      data-paged={paged ? '' : undefined}
    >
      {/* Paged mode: discrete sheet backgrounds painted behind the content. */}
      {paged &&
        pageBoxes.map((box, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: page indices are stable within a layout pass; top changes on reflow (the bug we're fixing)
            key={`sheet-${i}`}
            aria-hidden="true"
            className="parchment-page parchment-live-sheet"
            style={{ position: 'absolute', left: 0, right: 0, top: box.top, height: box.height }}
          />
        ))}

      {/* Paged mode: per-sheet chrome — watermark, running header, footer + page number.
          Sits above the sheet backgrounds (z-index:0) but below the content (z-index:1).
          aria-hidden because this is purely decorative/informational chrome. */}
      {paged &&
        pageBoxes.map((box, i) => {
          const section = resolveSection(sectionPxEntries, box.top)
          const effectiveWatermark = section.watermark ?? watermark
          const pageNumStr = formatPageNumber(i + 1, section.pageNumberFormat)
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: page indices are stable within a layout pass; top changes on reflow (the bug we're fixing)
              key={`chrome-${i}`}
              aria-hidden="true"
              className="parchment-live-chrome"
              style={{ position: 'absolute', left: 0, right: 0, top: box.top, height: box.height }}
            >
              <div
                className="parchment-paged-watermark"
                style={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                <WatermarkLayer config={effectiveWatermark} />
              </div>
              {section.headerText && (
                <div
                  className="parchment-running-header"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
                >
                  <span className="parchment-running-header-text">{section.headerText}</span>
                </div>
              )}
              <div
                className={`parchment-running-footer parchment-pn-${section.pageNumberPosition}`}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
              >
                {section.footerText && (
                  <span className="parchment-running-footer-text">{section.footerText}</span>
                )}
                {pageNumStr && <span className="parchment-page-number">{pageNumStr}</span>}
              </div>
            </div>
          )
        })}

      {/* Page-boundary overlays — decorative, aria-hidden (continuous mode only) */}
      {!paged &&
        allBreaks.map((offset, i) => {
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

      {/* G9: Per-page watermark overlays — one absolutely-positioned div per page region.
          Rendering one overlay per page (rather than one spanning the full canvas) ensures
          the watermark appears on every printed page: a single position:absolute element
          anchored at the top of the canvas is not replicated by the browser's print
          paginator, so pages 2+ would be bare. Instead we emit N overlays each sized to
          exactly one page height and offset to their page's top within the continuous canvas.

          The first page always starts at y=0. Each subsequent page starts at the previous
          break offset. The active section's watermark override (if set) takes precedence
          over the doc-level default for that page. */}
      {!paged &&
        (() => {
          // Build page-start offsets: page 1 starts at 0, each subsequent page starts at its break.
          const pageStarts: number[] = [0, ...allBreaks]
          return pageStarts.map((startPx) => {
            const section = resolveSection(sectionPxEntries, startPx)
            const effectiveWatermark = section.watermark ?? watermark
            return (
              <div
                key={startPx}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: startPx,
                  left: 0,
                  right: 0,
                  height: heightPx,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  zIndex: 0,
                }}
              >
                <WatermarkLayer config={effectiveWatermark} />
              </div>
            )
          })
        })()}

      {/* Content wrapper — measured by ResizeObserver */}
      <div ref={contentRef} className="parchment-page-content">
        {children}
      </div>
    </div>
  )
}
