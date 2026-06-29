# Live Word-style Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live editor in `data-page-layout="paged"` mode render discrete, editable Word-style page sheets — content fills each page, stops above its bottom margin, then resumes at the top of the next sheet across a grey gutter — without ever splitting the Yjs/ProseMirror document.

**Architecture:** A pure layout engine decides where pages break and how tall each inter-page spacer must be. React (the paged branch of `PageCanvas`) measures live block heights, runs the engine, paints discrete background sheets, and pushes a spacer list to a thin ProseMirror plugin. The plugin renders those spacers as non-document widget decorations that push content onto the next sheet. The contenteditable is transparent over the real sheet rectangles, so nothing is ever painted over text.

**Tech Stack:** Next.js, React, Tiptap 3.27.1 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/react`), ProseMirror, Yjs + y-prosemirror 1.3.7, Vitest 4 (unit), Playwright (e2e), Biome (lint), Claude Preview MCP (live browser verification).

## Global Constraints

- **View-layer only.** Never split or mutate document nodes. The Yjs/PM doc stays one continuous document.
- **Spacer updates use meta-only transactions** (`tr.setMeta(...)`, zero doc steps, `addToHistory: false`) so they produce no Yjs update and no history entry.
- **Continuous mode must stay byte-for-byte unchanged** in behavior. All new logic is gated on paged mode.
- **Blocks are atomic in v1** — never split a single block across pages (matches the existing read-only engine). An oversized block gets its own (grown) sheet.
- **Tests:** Vitest, files under `tests/unit/*.test.ts`, `environment: 'node'`, `@/` path alias works (vite-tsconfig-paths). Run a single file with `npx vitest run tests/unit/<file>.test.ts`.
- **Quality gates per task:** `npx biome check .` (lint) and `npx tsc --noEmit` (typecheck) must pass before each commit. Full suite `npm test` before the final task.
- **Theming:** sheets reuse the `.parchment-page` class so `var(--page-bg)` + `[data-page-bg="dark"]` theme them for free; gutter is `var(--editor-gutter)`.
- **Gutter constant:** `24` px, matching `.parchment-paged-root { gap: 24px }` in `src/styles/pagination.css`.
- **Commit after every task** with a `feat(pagination):` / `test(pagination):` / `refactor(pagination):` prefix.

---

### Task 1: Pure layout engine (`computePageLayout` + `topLevelBlockOffsets`)

**Files:**
- Create: `src/lib/editor/pagination/page-layout.ts`
- Create: `tests/unit/page-layout.test.ts`
- Modify: `src/lib/editor/pagination/index.ts` (add exports)

**Interfaces:**
- Consumes: nothing (pure; `@tiptap/pm/model` `Node` type only for `topLevelBlockOffsets`).
- Produces:
  - `type PageGeometry = { usableHeight: number; topMargin: number; bottomMargin: number; gutter: number; pageHeight: number }`
  - `type Spacer = { beforeBlockIndex: number; height: number }`
  - `type PageBox = { top: number; height: number; oversized: boolean }`
  - `type PageLayout = { breakBeforeBlock: number[]; spacers: Spacer[]; pageBoxes: PageBox[] }`
  - `computePageLayout(blockHeights: number[], forcedBreakBefore: ReadonlySet<number>, geo: PageGeometry): PageLayout`
  - `topLevelBlockOffsets(doc: ProseMirrorNode): number[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/page-layout.test.ts`:

```ts
import { Schema } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import {
  computePageLayout,
  type PageGeometry,
  topLevelBlockOffsets,
} from '@/lib/editor/pagination/page-layout'

// Geometry mirroring US-Letter @96dpi with 1in margins:
// pageHeight 1056, margins 96, usableHeight 1056-96-96 = 864.
const GEO: PageGeometry = {
  usableHeight: 864,
  topMargin: 96,
  bottomMargin: 96,
  gutter: 24,
  pageHeight: 1056,
}

describe('computePageLayout', () => {
  it('empty doc → single full-height page, no breaks/spacers', () => {
    const layout = computePageLayout([], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.spacers).toEqual([])
    expect(layout.pageBoxes).toEqual([{ top: 0, height: 1056, oversized: false }])
  })

  it('content that fits one page → one page, no breaks', () => {
    const layout = computePageLayout([200, 200, 200], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.spacers).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
  })

  it('overflow forces a break before the overflowing block', () => {
    // 500 + 500 = 1000 > 864 → break before block 1.
    const layout = computePageLayout([500, 500], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([1])
    expect(layout.spacers).toHaveLength(1)
    expect(layout.spacers[0].beforeBlockIndex).toBe(1)
    // spacer = (usable - usedPage0) + bottom + gutter + top
    //        = (864 - 500) + 96 + 24 + 96 = 580
    expect(layout.spacers[0].height).toBe(580)
  })

  it('bottom-margin guarantee: every spacer ≥ bottom + gutter + top', () => {
    const layout = computePageLayout([400, 400, 400, 400], new Set(), GEO)
    for (const s of layout.spacers) {
      expect(s.height).toBeGreaterThanOrEqual(GEO.bottomMargin + GEO.gutter + GEO.topMargin)
    }
  })

  it('page boxes are cumulative: top[k+1] = top[k] + height[k] + gutter', () => {
    const layout = computePageLayout([500, 500, 500], new Set(), GEO)
    // 3 blocks of 500: page0=[0] (500), break@1, page1=[1] (500), break@2, page2=[2]
    expect(layout.pageBoxes).toHaveLength(3)
    expect(layout.pageBoxes[0]).toEqual({ top: 0, height: 1056, oversized: false })
    expect(layout.pageBoxes[1]).toEqual({ top: 1056 + 24, height: 1056, oversized: false })
    expect(layout.pageBoxes[2]).toEqual({ top: 2 * (1056 + 24), height: 1056, oversized: false })
  })

  it('a block taller than a page gets its own grown sheet, no break before it if alone', () => {
    const layout = computePageLayout([2000], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
    expect(layout.pageBoxes[0].oversized).toBe(true)
    // grown height = content + top + bottom = 2000 + 96 + 96
    expect(layout.pageBoxes[0].height).toBe(2192)
  })

  it('oversized block in the middle is isolated on its own page', () => {
    // [300, 2000, 300]: 300 fits page0; +2000 overflows → break@1; 2000 alone
    // (oversized); +300 overflows (used already > usable) → break@2.
    const layout = computePageLayout([300, 2000, 300], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([1, 2])
    expect(layout.pageBoxes).toHaveLength(3)
    expect(layout.pageBoxes[1].oversized).toBe(true)
    expect(layout.pageBoxes[1].height).toBe(2000 + 96 + 96)
  })

  it('forced break splits even when content would fit', () => {
    const layout = computePageLayout([100, 100], new Set([1]), GEO)
    expect(layout.breakBeforeBlock).toEqual([1])
    // usedPage0 = 100 → spacer = (864-100)+96+24+96 = 980
    expect(layout.spacers[0].height).toBe(980)
  })

  it('degenerate usableHeight ≤ 0 → one page, no breaks', () => {
    const layout = computePageLayout([100, 100], new Set(), { ...GEO, usableHeight: 0 })
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
  })
})

describe('topLevelBlockOffsets', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'text*' },
      text: {},
    },
  })

  it('returns the PM position before each top-level block', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('ab')]), // nodeSize = 2 + 2 = 4
      schema.node('paragraph', null, [schema.text('cde')]), // nodeSize = 3 + 2 = 5
      schema.node('paragraph'), // empty, nodeSize = 2
    ])
    expect(topLevelBlockOffsets(doc)).toEqual([0, 4, 9])
  })

  it('empty doc → no offsets', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph')])
    expect(topLevelBlockOffsets(doc)).toEqual([0])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/page-layout.test.ts`
Expected: FAIL — `Cannot find module '@/lib/editor/pagination/page-layout'` (or "computePageLayout is not a function").

- [ ] **Step 3: Implement `page-layout.ts`**

Create `src/lib/editor/pagination/page-layout.ts`:

```ts
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
    return { breakBeforeBlock: [], spacers: [], pageBoxes: [{ top: 0, height: pageHeight, oversized: false }] }
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
```

- [ ] **Step 4: Add exports to the barrel**

Modify `src/lib/editor/pagination/index.ts` — append:

```ts
export {
  computePageLayout,
  type PageBox,
  type PageGeometry,
  type PageLayout,
  type Spacer,
  topLevelBlockOffsets,
} from '@/lib/editor/pagination/page-layout'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/page-layout.test.ts`
Expected: PASS (all 11 tests).

- [ ] **Step 6: Lint + typecheck**

Run: `npx biome check . && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/pagination/page-layout.ts src/lib/editor/pagination/index.ts tests/unit/page-layout.test.ts
git commit -m "feat(pagination): pure page-layout engine (spacers, page boxes, block offsets)"
```

---

### Task 2: Live spike — plugin + paged background sheets + spacers, verified in-browser

This is the de-risk milestone: the smallest thing that proves the mechanism end-to-end (spacers push content, real sheets render behind, editing + caret + theming work). It deliberately bundles the plugin, the React measurement/background layer, the Editor wiring, and the CSS, because none of them is independently observable.

**Files:**
- Create: `src/lib/editor/extensions/pagination-live.ts`
- Modify: `src/components/editor/PageCanvas.tsx` (paged branch only)
- Modify: `src/components/editor/Editor.tsx` (register extension)
- Modify: `src/styles/pagination.css` (live paged sheet/gutter rules)

**Interfaces:**
- Consumes: `computePageLayout`, `topLevelBlockOffsets`, `PageBox`, `Spacer`, `PageGeometry` from Task 1.
- Produces:
  - `PaginationLive` Tiptap extension (default export-style named export) registering a PM plugin under `paginationKey`.
  - `paginationKey: PluginKey<{ spacers: Spacer[] }>`.
  - Editor command `setPaginationSpacers(spacers: Spacer[]): boolean`.

- [ ] **Step 1: Create the ProseMirror plugin extension**

Create `src/lib/editor/extensions/pagination-live.ts`:

```ts
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type Spacer, topLevelBlockOffsets } from '@/lib/editor/pagination'

export interface PaginationState {
  spacers: Spacer[]
}

export const paginationKey = new PluginKey<PaginationState>('paginationLive')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paginationLive: {
      /** Replace the live-pagination spacer list (meta-only; no doc change). */
      setPaginationSpacers: (spacers: Spacer[]) => ReturnType
    }
  }
}

/** The DOM for one spacer: an inert block that simply occupies vertical space. */
function makeSpacerDOM(height: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'parchment-page-spacer'
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('data-pagination-spacer', '')
  el.contentEditable = 'false'
  el.style.height = `${height}px`
  el.style.width = '100%'
  el.style.pointerEvents = 'none'
  el.style.userSelect = 'none'
  return el
}

/**
 * Thin live-pagination plugin: holds a spacer list (pushed from React) and
 * renders each as a non-document widget decoration before its target block. It
 * does NO measurement and owns NO timers. Updates arrive via a meta-only
 * transaction, so they create no Yjs update and no history entry.
 */
export const PaginationLive = Extension.create({
  name: 'paginationLive',

  addCommands() {
    return {
      setPaginationSpacers:
        (spacers: Spacer[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(paginationKey, { spacers })
            tr.setMeta('addToHistory', false)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ spacers: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as PaginationState | undefined
            return meta ?? value
          },
        },
        props: {
          decorations(state) {
            const pstate = paginationKey.getState(state)
            const spacers = pstate?.spacers ?? []
            if (spacers.length === 0) return DecorationSet.empty
            const offsets = topLevelBlockOffsets(state.doc)
            const decos: Decoration[] = []
            for (const s of spacers) {
              const pos = offsets[s.beforeBlockIndex]
              if (pos == null) continue
              decos.push(
                Decoration.widget(pos, () => makeSpacerDOM(s.height), {
                  side: -1,
                  key: `pg-spacer-${s.beforeBlockIndex}-${s.height}`,
                }),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
```

- [ ] **Step 2: Register the extension in the editor**

Modify `src/components/editor/Editor.tsx`. Add the import near the other extension imports (around line 33):

```ts
import { PaginationLive } from '@/lib/editor/extensions/pagination-live'
```

Add `PaginationLive` to the `extensions: [...]` array inside `useEditor` (around line 953). It needs no config:

```ts
      PaginationLive,
```

- [ ] **Step 3: Add the measurement + background-sheet logic to PageCanvas (paged branch)**

Modify `src/components/editor/PageCanvas.tsx`. Add imports:

```ts
import { computePageLayout, type PageBox, type PageGeometry } from '@/lib/editor/pagination'
import { topLevelBlockOffsets } from '@/lib/editor/pagination'
```

Add a module constant near the top (after imports):

```ts
/** Inter-sheet gutter (matches .parchment-paged-root gap in pagination.css). */
const GUTTER_PX = 24
```

Inside the `PageCanvas` component, after the existing hooks, add paged-mode state + the measurement effect. `pageBoxes` drives the background sheets; the spacer list is pushed into the plugin:

```ts
  const paged = pageLayoutMode === 'paged'
  const [pageBoxes, setPageBoxes] = useState<PageBox[]>([])
  // The spacer heights we last pushed, keyed by beforeBlockIndex, so the next
  // measurement can subtract them and recover spacer-free raw block heights.
  const spacerByIndexRef = useRef<Map<number, number>>(new Map())

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
        return
      }

      // Top of each block relative to the editor content box.
      const editorRect = view.dom.getBoundingClientRect()
      const tops: number[] = []
      for (const pos of offsets) {
        const node = view.nodeDOM(pos) as HTMLElement | null
        tops.push(node ? node.getBoundingClientRect().top - editorRect.top : 0)
      }
      const contentBottom = view.dom.getBoundingClientRect().height

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
        nextMap.size !== prevSpacers.size ||
        [...nextMap].some(([k, v]) => prevSpacers.get(k) !== v)
      if (changed) {
        spacerByIndexRef.current = nextMap
        editor.commands.setPaginationSpacers(layout.spacers)
      }
      setPageBoxes(layout.pageBoxes)
      onPageCountChange?.(layout.pageBoxes.length)
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
    for (const img of imgs) if (!img.complete) img.addEventListener('load', schedule, { once: true })

    return () => {
      if (timer) clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      editor.off('update', schedule)
      ro.disconnect()
    }
  }, [paged, editor, heightPx, margins.top, margins.bottom, onPageCountChange])
```

Then, in the returned JSX, branch the container styling and add the background layer. Change the root `<div>`'s style so paged mode uses the gutter background and is a positioning context, and render the sheets behind the content. Add this block immediately inside the root container, BEFORE the existing `{allBreaks.map(...)}` overlays (which stay for continuous mode):

```tsx
      {paged &&
        pageBoxes.map((box, i) => (
          <div
            key={`sheet-${i}-${box.top}`}
            aria-hidden="true"
            className="parchment-page parchment-live-sheet"
            style={{ position: 'absolute', left: 0, right: 0, top: box.top, height: box.height }}
          />
        ))}
```

And gate the existing continuous-mode boundary overlays + watermark-per-page block so they only render when NOT paged (wrap each existing `{...map(...)}` expression with `{!paged && (...)}`). The new per-sheet watermark/header/footer rendering for paged mode is added in Tasks 4–5; this task only needs blank sheets.

Update the root container `style`/`className` to switch background in paged mode:

```tsx
    <div
      style={{
        width: widthPx,
        paddingTop: margins.top,
        paddingRight: margins.right,
        paddingBottom: margins.bottom,
        paddingLeft: margins.left,
        position: 'relative',
        ...(paged ? { background: 'var(--editor-gutter)' } : {}),
      }}
      className="parchment-page mx-auto"
      data-page-layout={pageLayoutMode}
      data-paged={paged ? '' : undefined}
    >
```

> Note: the root keeps the `.parchment-page` class for both modes (so continuous mode is unchanged). In paged mode the CSS in Step 4 makes the root's own paper background/shadow/border transparent (the real sheets carry them) — see the `[data-paged]` rules.

- [ ] **Step 4: Add the live paged CSS**

Append to `src/styles/pagination.css`:

```css
/* ── Live paged editor: discrete sheets behind a transparent contenteditable ──
 *
 * In paged mode the editor's .parchment-page container is flattened to the gutter
 * field; the real sheets are .parchment-live-sheet rectangles painted BEHIND the
 * (transparent) content by PageCanvas, at offsets from the pure layout engine.
 * Spacer widget decorations (.parchment-page-spacer) in the content flow push
 * each block onto its sheet, so no text ever sits in a gutter. */

.parchment-page[data-paged] {
  /* The container is just the gutter field + positioning context; its own paper
     look is dropped because the .parchment-live-sheet elements carry it. */
  background: var(--editor-gutter) !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

/* Each real sheet reuses the .parchment-page paper styling (page-bg, border,
   shadow, radius from globals.css). It sits behind the content. */
.parchment-live-sheet {
  z-index: 0;
  /* width comes from left:0/right:0 inline; paper look inherited via .parchment-page */
}

/* The editable content rides above the sheets. */
.parchment-page[data-paged] .parchment-page-content {
  position: relative;
  z-index: 1;
}

/* Spacers occupy space but are visually nothing (the gutter shows through from
   the container behind them). */
.parchment-page-spacer {
  display: block;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx biome check .`
Expected: no errors. (Biome may want import ordering — run `npx biome check --write .` if it reports fixable issues, then re-run.)

- [ ] **Step 6: Live browser verification — light mode, 2-page doc**

This task's real test. Use the Claude Preview MCP tools:

1. `preview_start` (Next dev server). Note the URL.
2. Sign in / open an existing multi-page document, or create one and paste enough paragraphs to exceed one page (≥ ~30 short paragraphs). Ensure the workspace page-layout setting is **paged** (`getPageLayoutMode`); if it's continuous, switch it in the app UI (page layout toggle) so `data-page-layout="paged"`.
3. `preview_snapshot` — confirm the editor rendered.
4. `preview_screenshot` — confirm visually:
   - Two (or more) discrete white sheets with a grey gutter gap + shadows between them.
   - Page 1's last block stops above the bottom margin; page 2's first block starts at the top of the new sheet's text area.
   - No text sits in the gutter; nothing is painted over a line.
5. `preview_console_logs` — confirm NO "Maximum update depth"/ResizeObserver loop errors and no thrown errors.
6. Click into the document near the page boundary and type (`preview_click` + `preview_fill` or `preview_eval` dispatching input). `preview_screenshot` again — confirm it re-paginates (debounced) and the caret is usable (not trapped in the gutter).

Fix any issues by editing the source (re-check from Step 5), then re-verify. Do NOT proceed until light-mode sheets look like discrete Word pages.

- [ ] **Step 7: Live browser verification — dark page mode**

1. Switch the document/page background to the dark page theme (sets `[data-page-bg="dark"]`).
2. `preview_screenshot` — confirm sheets are dark paper and the gutter reads as the trough between them. There must be NO light band over the dark page (the failure mode of all prior attempts).
3. `preview_console_logs` — clean.

Capture both screenshots; they go to the user at the end of Task 6 but eyeball them now.

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/extensions/pagination-live.ts src/components/editor/PageCanvas.tsx src/components/editor/Editor.tsx src/styles/pagination.css
git commit -m "feat(pagination): live editable Word-style page sheets (spike)"
```

---

### Task 3: Idempotency, collab, and editing robustness

Harden the spike against the remaining risks: reflow loops, collab edits, and selection across spacers.

**Files:**
- Modify: `src/components/editor/PageCanvas.tsx` (only if fixes are needed)
- Modify: `src/lib/editor/extensions/pagination-live.ts` (only if fixes are needed)

**Interfaces:**
- Consumes: everything from Task 2. Produces: no new public surface.

- [ ] **Step 1: Verify no reflow loop**

With the paged doc open and idle, `preview_console_logs` and watch for ~10s. Expected: the recompute fires once after load and then stops (no continuous stream of spacer updates). If spacers oscillate, the raw-height subtraction is off — verify `spacerByIndexRef` is keyed by `beforeBlockIndex` and subtracted from the slot to the NEXT block, and that the deep-equal guard prevents redundant `setPaginationSpacers`. Fix and re-verify.

- [ ] **Step 2: Verify caret + selection across a spacer**

In the browser: place the caret at the end of the last line of page 1, press ArrowDown / ArrowRight — the caret must move to the first line of page 2 (stepping over the gutter, never landing "inside" it). Then click-drag a selection from page 1 into page 2 and confirm the selection is contiguous and highlights correctly. Use `preview_eval` to read `window.getSelection()?.toString()` to confirm the spanned text. If the caret gets trapped, ensure the spacer widget is `contentEditable=false` and has `side: -1`. Fix and re-verify.

- [ ] **Step 3: Verify Yjs/markdown are untouched by spacers**

In the browser console via `preview_eval`, confirm the document JSON has no spacer nodes:
`JSON.stringify(window).length` is not useful; instead assert via the editor: evaluate that the serialized doc contains only real nodes. Practically: `preview_eval` running `document.querySelectorAll('[data-pagination-spacer]').length` returns > 0 (spacers exist in the DOM) while the editor's getJSON (if exposed) shows the same block count as before pagination. If the editor instance isn't on `window`, add a temporary debug hook OR rely on the structural guarantee (decorations never enter the doc) + the fact that undo/redo (Ctrl/Cmd-Z) does not remove a spacer. Verify undo/redo does not treat spacer updates as history steps: type a char, undo once → the char is removed in one undo (not "undo the spacer first").

- [ ] **Step 4: Verify collaboration (two clients)**

If a second browser context is available via the preview tools, open the same doc in two sessions. Type in client A near a page boundary; confirm in client B the text syncs AND pagination re-runs (B re-paginates from its own measurement). Confirm remote cursors (CollaborationCaret) still appear and are positioned correctly — not shifted by spacers. If only one context is available, at minimum confirm the collab connection is live (no disconnect) and the `addToHistory: false` meta is set so spacer transactions are not broadcast as doc updates (they have no steps, so y-prosemirror ignores them — confirm via no spurious "synced" churn in `preview_network`).

- [ ] **Step 5: Commit (include any fixes)**

```bash
git add -A
git commit -m "test(pagination): verify idempotency, caret, collab; harden as needed"
```

(If no code changes were needed, commit a short note in the plan's verification log or skip — but record the verification outcome in the PR description later.)

---

### Task 4: Oversized blocks and manual page breaks

The engine already isolates oversized blocks and accepts forced breaks (Task 1). This task confirms they render correctly live and that the background sheet grows for an oversized block.

**Files:**
- Modify: `src/components/editor/PageCanvas.tsx` (only if the oversized sheet height needs CSS/overflow handling)
- Modify: `src/styles/pagination.css` (oversized sheet overflow, if needed)

**Interfaces:** Consumes Task 1 `pageBoxes[].oversized`/`height`. No new surface.

- [ ] **Step 1: Verify a block taller than a page**

In the browser, insert a very tall image (or a long code block) that exceeds one page height. `preview_screenshot`. Expected: the oversized block sits on its OWN sheet, that sheet is taller than a normal sheet (grown to fit), and the block is NOT split. The block may visually overflow the page bottom margin (acceptable, like Word) — but the sheet rectangle should have grown to contain it per `computePageLayout`. If the content overflows the painted sheet, confirm `.parchment-live-sheet` height tracks `box.height` (it does, inline). 

- [ ] **Step 2: Verify a manual page break**

Insert a manual page break (the `pageBreak` node — via the slash menu / toolbar "page break" command). `preview_screenshot`. Expected: content after the break starts on a new sheet even if the previous page wasn't full. Confirm the `forced` set in PageCanvas maps the `pageBreak` node to the following block index (the measurement effect's `doc.forEach` over `pageBreak`).

> Edge case to check: a `pageBreak` node is itself a top-level block, so it occupies a block index and contributes ~0 height. Confirm the forced break lands before the block AFTER the pageBreak node, and that the pageBreak node's own (near-zero) slot doesn't create a stray tiny page. If it does, exclude `pageBreak`/`sectionBreak` nodes from `blockHeights` accounting OR give their slot zero height — verify which is needed in-browser and apply the minimal fix.

- [ ] **Step 3: Console clean + commit**

Run: `preview_console_logs` (clean), then:

```bash
git add -A
git commit -m "feat(pagination): oversized blocks + manual page breaks in live paged mode"
```

---

### Task 5: Port running headers/footers, page numbers, and watermarks

Restore the section chrome that continuous-mode paged overlays rendered, now driven by the real `pageBoxes` geometry.

**Files:**
- Modify: `src/components/editor/PageCanvas.tsx` (render per-sheet chrome from `pageBoxes` + existing `sectionPxEntries`/`watermark`)
- Modify: `src/styles/pagination.css` (position chrome within sheets/gutter)

**Interfaces:** Consumes `pageBoxes` (Task 2), the existing `resolveSection`, `sectionPxEntries`, `formatPageNumber`, `WatermarkLayer`, and `watermark` prop already in PageCanvas.

- [ ] **Step 1: Render per-sheet watermark + header/footer/page-number for paged mode**

In the paged branch, for each `pageBox`, render: a watermark overlay sized to the sheet, a running header at the sheet's top margin, and a running footer + page number at the sheet's bottom margin. Map the page's section config by its top offset using the existing `resolveSection(sectionPxEntries, box.top)`. Add, alongside the background sheets:

```tsx
      {paged &&
        pageBoxes.map((box, i) => {
          const section = resolveSection(sectionPxEntries, box.top)
          const effectiveWatermark = section.watermark ?? watermark
          const pageNumStr = formatPageNumber(i + 1, section.pageNumberFormat)
          return (
            <div
              key={`chrome-${i}-${box.top}`}
              aria-hidden="true"
              className="parchment-live-chrome"
              style={{ position: 'absolute', left: 0, right: 0, top: box.top, height: box.height }}
            >
              <div
                className="parchment-paged-watermark"
                style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
              >
                <WatermarkLayer config={effectiveWatermark} />
              </div>
              {section.headerText && (
                <div className="parchment-running-header" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
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
```

The chrome layer must sit above the sheets but below the content: give `.parchment-live-chrome { z-index: 0 }` and keep `.parchment-page-content { z-index: 1 }` (header/footer are in the margin area where there is no body text, so z-order with content is not a conflict, but watermark must be behind text).

- [ ] **Step 2: CSS for chrome positioning**

Append to `src/styles/pagination.css`:

```css
.parchment-live-chrome {
  pointer-events: none;
}
.parchment-live-chrome .parchment-running-header,
.parchment-live-chrome .parchment-running-footer {
  padding-left: 96px; /* align with default page margins; visual only */
  padding-right: 96px;
}
```

- [ ] **Step 3: Live verification**

Open a doc with a section break that sets a header, footer, and page-number format, plus a doc-level watermark. `preview_screenshot` across two pages. Expected: header at each sheet's top margin, footer + correct page number at each sheet's bottom margin, watermark behind the text on every sheet. Confirm dark mode still themes (`preview_resize`/theme toggle + screenshot). `preview_console_logs` clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pagination): running headers/footers/page-numbers + watermarks on live sheets"
```

---

### Task 6: Remove dead CSS/overlays, full verification, finish branch

**Files:**
- Modify: `src/app/globals.css` (delete the failed translucent-band block)
- Modify: `src/components/editor/PageCanvas.tsx` (remove now-dead continuous-canvas paged overlay code paths)
- Modify: `src/styles/pagination.css` (only if cleanup needed)

**Interfaces:** none new.

- [ ] **Step 1: Delete the failed paged-overlay CSS**

In `src/app/globals.css`, delete the entire `v0.1.5: Paged-mode boundary visual` block — the rules:
- `.parchment-page[data-page-layout="paged"] .parchment-page-boundary { box-shadow: ... }`
- `.parchment-page[data-page-layout="paged"] .parchment-page-divider { ... }`
- `.parchment-page[data-page-layout="paged"] .parchment-page-divider::before { ... }`

(Currently around lines 1053–1125; match by the comment banner `v0.1.5: Paged-mode boundary visual` through the end of the `::before` rule.) Leave the base `.parchment-page-divider`, `.parchment-running-header/footer` rules intact — continuous mode and the chrome classes still use them.

- [ ] **Step 2: Remove dead overlay code in PageCanvas**

The old `allBreaks`/`.parchment-page-boundary` overlays and the old per-page watermark loop were gated to `!paged` in Task 2. In continuous mode these are still the intended behavior, so KEEP them. Only remove anything that is now unreachable in BOTH modes. Verify by reading the file: the `measurePageBreaks`/`autoBreaks` path still drives continuous-mode page count — keep it. Net: likely no deletion here beyond confirming the `!paged` gates. Document this in the commit if nothing is removed.

- [ ] **Step 3: Full automated gates**

Run:
```bash
npm test
npx tsc --noEmit
npx biome check .
npm run build
```
Expected: unit suite green (incl. `tests/unit/page-layout.test.ts`), no type errors, no lint errors, production build succeeds.

- [ ] **Step 4: Full live acceptance pass (all 8 criteria)**

On a real ≥2-page doc containing at least one oversized block and one manual page break, in BOTH light and dark page modes, verify and screenshot each:
1. Discrete sheets + visible grey gutter gap + shadows.
2. Page 1 stops above its bottom margin; page 2 starts at the new sheet's top text area.
3. No text occluded anywhere.
4. Breaks fall on block boundaries (never mid-line).
5. Oversized block on its own grown sheet, not split.
6. Typing near a boundary re-paginates (debounced); caret behaves.
7. Dark page: dark sheets, gutter trough, no light band.
8. Manual page break → new sheet; header/footer/page-number + watermark render.

Capture `preview_screenshot` for light multi-page and dark multi-page.

- [ ] **Step 5: Deliver screenshots to the user**

Send the light + dark multi-page screenshots via the file/preview channel and summarize what was verified. The user is the final acceptance gate.

- [ ] **Step 6: Commit + finish branch**

```bash
git add -A
git commit -m "refactor(pagination): remove failed CSS band; finalize live paged pagination"
```

Then invoke the `superpowers:finishing-a-development-branch` skill to choose merge/PR/cleanup. Do not merge without the user's screenshot sign-off.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Live editable sheets → Tasks 2–5. ✓
- Bottom-margin guarantee → Task 1 spacer math + test. ✓
- Block-boundary-only breaks → Task 1 (atomic) + Task 6 criterion 4. ✓
- Doc model untouched / collab / markdown → Task 2 (meta-only, widget decorations) + Task 3 verification. ✓
- Re-paginate live, debounced → Task 2 measurement effect. ✓
- Dark page mode → Task 2 Step 7 + Task 6 criterion 7. ✓
- Manual page breaks → Task 4. ✓
- Running headers/footers/page-numbers + watermarks → Task 5. ✓
- Oversized blocks → Task 1 + Task 4. ✓
- Remove failed CSS → Task 6. ✓
- Print/export untouched → no task modifies `PaginatedDocument.tsx`. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. DOM-integration tasks (2–6) use concrete live-verification procedures with exact preview tools instead of unit tests, by design (node-env vitest cannot render the contenteditable) — the pure decision logic they rely on is fully unit-tested in Task 1.

**Type consistency:** `Spacer`, `PageBox`, `PageGeometry`, `PageLayout`, `paginationKey`, `setPaginationSpacers`, `topLevelBlockOffsets`, `computePageLayout`, `GUTTER_PX` are used identically across tasks.

## Known limitations (v1)
- A single block taller than a page is not split (atomic) — it overflows its grown sheet, like a giant image in Word.
- Tables/paragraphs are not split mid-block across a page boundary.
- Re-pagination is whole-document on each debounced change (no incremental measurement) — acceptable for typical docs; a future optimization if very large docs lag.
