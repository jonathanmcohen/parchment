'use client'

// True content-splitting pagination (v0.1.10 #11/#12/#13).
//
// Renders a READ-ONLY snapshot of a document as REAL, discrete .parchment-page
// sheets — not a single continuous canvas with overlay markers. Each top-level
// block is measured in the DOM, the pure paginator decides where pages break,
// and the blocks are re-emitted distributed across separate sheet elements with
// the Word-style gutter between them.
//
// WHY READ-ONLY: the live editor is a single Tiptap contenteditable — one
// contiguous DOM tree that cannot be split across multiple sheet <div>s while
// remaining editable. So this component paginates a static snapshot, which is
// exactly what print/PDF and a faithful page preview need. The live editing
// canvas stays continuous (its existing behaviour) and is unaffected by this.
//
// MEASUREMENT: we render all blocks once into a hidden measuring container at the
// page's content width, then read each block's slot height from the delta between
// consecutive children's offsetTop (this naturally accounts for collapsed margins
// between blocks). Heights feed computeBreakIndices; blocks are atomic (never
// split mid-block). Reflow is debounced so rapid edits don't thrash.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { WatermarkLayer } from '@/components/editor/WatermarkLayer'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import { DEFAULT_PAGE_SETUP, type PageSetup, resolvePageDims } from '@/lib/editor/paginate'
import {
  type BlockHeight,
  computeBreakIndicesVariable,
  contentBoxFor,
  orientationForPage,
  type PageOrientations,
  pagesFromBreaks,
} from '@/lib/editor/pagination'
import { DEFAULT_WATERMARK, type WatermarkConfig } from '@/lib/editor/watermark'

type Props = {
  /** Snapshot of the document (ProseMirror JSON). */
  content: unknown
  /** Page size / margins / document-default orientation. */
  pageSetup?: PageSetup
  /** Per-page orientation overrides (sparse; inherit-by-default). */
  pageOrientations?: PageOrientations
  /** Doc-level watermark; painted behind each sheet's content. */
  watermark?: WatermarkConfig
  /** Notifies the host of the computed page count whenever it changes. */
  onPageCountChange?: (n: number) => void
  /** When true, code blocks render with pre-built Shiki HTML (export/print). */
  exportHighlight?: boolean
  /** Debounce for re-measuring after a content/setup change (ms). */
  reflowDelayMs?: number
}

/** Extract the top-level block nodes from a ProseMirror doc snapshot. */
function topLevelBlocks(content: unknown): unknown[] {
  if (!content || typeof content !== 'object') return []
  const doc = content as { type?: string; content?: unknown[] }
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return []
  return doc.content
}

/**
 * Read per-block slot heights from a measuring container whose direct children
 * are the rendered top-level blocks, in order.
 *
 * The slot height of block i is `child[i+1].offsetTop - child[i].offsetTop`; for
 * the final block it is `container.scrollHeight - child[last].offsetTop`. Using
 * offsetTop deltas (rather than each child's own offsetHeight) captures the
 * collapsed margin BETWEEN blocks exactly as the browser laid it out, so the
 * accumulated heights match what a printed page would show.
 */
function measureSlotHeights(container: HTMLElement): BlockHeight[] {
  const children = Array.from(container.children) as HTMLElement[]
  if (children.length === 0) return []
  const tops = children.map((c) => c.offsetTop)
  const total = container.scrollHeight
  const heights: BlockHeight[] = []
  for (let i = 0; i < children.length; i++) {
    const top = tops[i] ?? 0
    const nextTop = i + 1 < tops.length ? (tops[i + 1] ?? total) : total
    heights.push({ height: Math.max(0, nextTop - top) })
  }
  return heights
}

export function PaginatedDocument({
  content,
  pageSetup = DEFAULT_PAGE_SETUP,
  pageOrientations = [],
  watermark = DEFAULT_WATERMARK,
  onPageCountChange,
  exportHighlight = false,
  reflowDelayMs = 250,
}: Props) {
  const blocks = useMemo(() => topLevelBlocks(content), [content])

  // Stable-ish serialization of the inputs that should trigger a re-measure.
  // pageSetup + orientations affect the content width/height; content affects
  // the blocks. We avoid re-measuring on unrelated parent re-renders.
  const measureKey = useMemo(
    () =>
      JSON.stringify({
        n: blocks.length,
        setup: pageSetup,
        ori: pageOrientations,
        // Content identity: blocks come from a snapshot; JSON length + a shallow
        // hash keeps the key cheap yet sensitive to edits.
        c: content,
      }),
    [blocks.length, pageSetup, pageOrientations, content],
  )

  // The default-orientation content box drives the measuring width (a single
  // measurement pass). Per-page orientation then selects each sheet's usable
  // HEIGHT for breaking and its rendered WIDTH — height breaking is exact; a
  // landscape page only re-wraps text slightly wider, which is acceptable.
  const defaultContentBox = useMemo(
    () => contentBoxFor(pageSetup, pageSetup.orientation),
    [pageSetup],
  )

  const measureRef = useRef<HTMLDivElement>(null)
  const [breakIndices, setBreakIndices] = useState<number[]>([])
  const [measured, setMeasured] = useState(false)

  // Per-page usable HEIGHT selector: page i uses its resolved orientation's
  // content-box height. Stable across renders for the same setup/orientations so
  // the measurement effects can depend on it without re-running spuriously.
  const usableForPage = useMemo(
    () => (pageIndex: number) =>
      contentBoxFor(pageSetup, orientationForPage(pageSetup, pageOrientations, pageIndex)).heightPx,
    [pageSetup, pageOrientations],
  )

  // ── Measure + paginate (debounced) ─────────────────────────────────────────
  useEffect(() => {
    // measureKey is referenced so Biome treats it as the genuine trigger.
    void measureKey

    let raf = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = () => {
      const el = measureRef.current
      if (!el) return
      const heights = measureSlotHeights(el)
      const indices = computeBreakIndicesVariable(heights, usableForPage)
      setBreakIndices(indices)
      setMeasured(true)
      onPageCountChange?.(indices.length + 1)
    }

    // Two rAFs + a debounce timer: let the off-screen render settle (fonts,
    // images that already have intrinsic size) before reading geometry.
    timer = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(run)
      })
    }, reflowDelayMs)

    return () => {
      if (timer) clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [measureKey, usableForPage, onPageCountChange, reflowDelayMs])

  // Re-measure when images inside the measuring container finish loading (their
  // height is 0 until then, which would mis-place later blocks).
  useEffect(() => {
    void measureKey
    const el = measureRef.current
    if (!el) return
    const imgs = Array.from(el.querySelectorAll('img'))
    if (imgs.length === 0) return
    let cancelled = false
    const onLoad = () => {
      if (cancelled) return
      const heights = measureSlotHeights(el)
      const indices = computeBreakIndicesVariable(heights, usableForPage)
      setBreakIndices(indices)
      onPageCountChange?.(indices.length + 1)
    }
    for (const img of imgs) {
      if (!img.complete) img.addEventListener('load', onLoad, { once: true })
    }
    return () => {
      cancelled = true
      for (const img of imgs) img.removeEventListener('load', onLoad)
    }
  }, [measureKey, usableForPage, onPageCountChange])

  const pages = useMemo(
    () => pagesFromBreaks(blocks.length, breakIndices),
    [blocks.length, breakIndices],
  )

  const baseId = useId()

  // The read-only render used by the hidden measuring container (full doc).
  const measureBody = useMemo(
    () => renderReadOnlyDoc(content, exportHighlight ? { exportHighlight: true } : undefined),
    [content, exportHighlight],
  )

  // Pages to actually emit as sheets. Before the first measurement completes we
  // emit a single sheet with all blocks (correct content; pagination kicks in on
  // the next frame) so there is never a blank flash or a wrong page count.
  const displayPages = useMemo(
    () => (measured ? pages : [{ start: 0, end: blocks.length }]),
    [measured, pages, blocks.length],
  )

  // Each sheet re-renders only ITS blocks from the source JSON, so a block is
  // emitted on exactly one sheet (real content splitting) and code blocks keep
  // their pre-built Shiki HTML when exportHighlight is set.
  const pageBodies = useMemo(
    () =>
      displayPages.map((p) =>
        renderReadOnlyDoc(
          { type: 'doc', content: blocks.slice(p.start, p.end) },
          exportHighlight ? { exportHighlight: true } : undefined,
        ),
      ),
    [displayPages, blocks, exportHighlight],
  )

  return (
    <div className="parchment-paged-root" data-paged-root="">
      {/* Hidden measuring container: full read-only doc at the default content
          width. aria-hidden + offscreen so it is never read or interacted with.
          Width is the usable content width (sheet minus L/R margins). */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="parchment-paged-measure"
        style={{ width: defaultContentBox.widthPx }}
      >
        {measureBody}
      </div>

      {/* Real, discrete sheets — one .parchment-page per page, Word-style gutter
          between them (painted by pagination.css). */}
      {displayPages.map((p, i) => {
        const orientation = orientationForPage(pageSetup, pageOrientations, i)
        const sheet = resolvePageDims({
          size: pageSetup.size,
          orientation,
          widthPx: pageSetup.widthPx,
          heightPx: pageSetup.heightPx,
        })
        const { margins } = pageSetup
        return (
          <div
            // Key by the page's block RANGE (not the bare array index): when a
            // reflow shifts where pages break, sheets covering the same blocks
            // keep their identity, which is the closest thing to a stable id here.
            key={`${baseId}-${p.start}-${p.end}`}
            className="parchment-page parchment-paged-sheet mx-auto"
            data-page-orientation={orientation}
            data-page-index={i}
            style={{
              width: sheet.widthPx,
              minHeight: sheet.heightPx,
              paddingTop: margins.top,
              paddingRight: margins.right,
              paddingBottom: margins.bottom,
              paddingLeft: margins.left,
            }}
          >
            <div
              aria-hidden="true"
              className="parchment-paged-watermark"
              style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
            >
              <WatermarkLayer config={watermark} />
            </div>
            <div className="parchment-paged-content">{pageBodies[i]}</div>
          </div>
        )
      })}
    </div>
  )
}
