# Live Word-style pagination (paged editor mode)

- **Date:** 2026-06-28
- **Status:** Approved design — ready for implementation plan
- **Scope:** The LIVE editing canvas in `data-page-layout="paged"` mode only. The
  Yjs/ProseMirror document model stays a single continuous document — no document
  nodes are split. Print/export (`PaginatedDocument`) is unchanged.

## Problem

In paged layout mode the editor renders the whole document as ONE continuous
`.parchment-page` sheet (e.g. a 2-page doc is a single ~2018px-tall sheet).
Content flows straight through the page boundary — text sits exactly where page 1
should end and page 2 begin. There is no visible Word-style break: no
page-1-ends-here, no grey gutter gap, no sheet shadows; content never stops at a
page bottom.

The current paged visuals are CSS overlays on a continuous canvas:
`PageCanvas.tsx` measures `contentRef.scrollHeight`, calls `measurePageBreaks()`
(fixed multiples of page height), and paints absolutely-positioned
`.parchment-page-boundary` overlays. The `[data-page-layout="paged"]` CSS block
(`globals.css:1053-1125`) draws a translucent gutter band + edge shadows on a
`height:0` divider.

### Why CSS alone cannot fix it (proven, repeatedly)

1. A band at a fixed page-height offset lands mid-paragraph and either occludes
   the real text there or (kept translucent to avoid that) reads as a smear over
   live text rather than a true page edge. A live-injected 44px grey band cut
   through a line and clashed with the dark page.
2. CSS cannot make content actually *end* at the page bottom — the canvas is one
   continuous flow, so there is always text straddling the seam.

The blocker is the continuous canvas. The fix must make content genuinely stop at
each page bottom and resume at the top of the next sheet, at a safe block
boundary — a real editor feature, not a paint job.

## What already exists (and is reused)

The hard half of true pagination is already in the repo, shipped for the
READ-ONLY print/PDF/preview path:

- `src/lib/editor/pagination/break-index.ts` — `computeBreakIndicesVariable()`:
  pure, DOM-free, greedy first-fit, treats each top-level block as ATOMIC (never
  split mid-block), isolates an oversized block on its own page. Unit-tested.
- `src/lib/editor/pagination/page-model.ts` — pure page geometry (sheet box,
  usable content box, per-page orientation).
- `src/components/editor/PaginatedDocument.tsx` — measures each top-level block's
  height in a hidden container (offsetTop deltas, capturing collapsed margins),
  runs the engine, and re-emits blocks across REAL discrete `.parchment-page`
  sheets with a Word-style gutter. Correct in light + dark + print.

What's missing: the LIVE editable canvas (`PageCanvas.tsx`) never uses any of
this. It is the only thing this spec changes.

## Goals

- In paged mode, the live editor shows discrete Word-style sheets: content fills
  page 1's text area, stops, a grey gutter gap with sheet shadows follows, then
  page 2's first block starts at the top of a new sheet.
- Every page keeps its **bottom margin** — content never reaches the sheet's
  bottom edge.
- Breaks land only at top-level block boundaries — never mid-line.
- The document stays editable, with the cursor, selection, collab cursors,
  markdown mirror, and Yjs sync all behaving exactly as today.
- Re-paginates live on edits (debounced) and on width/font changes.
- Themes correctly in dark-page mode (no light band on a dark page).
- Manual page breaks, section running headers/footers/page-numbers, and
  watermarks keep working (no regression vs. today's paged overlays).

## Non-goals (v1)

- Splitting a single block across a page boundary (a tall table or a
  page-spanning paragraph). Blocks stay atomic, matching the existing engine; an
  oversized block gets its own page and overflows its sheet like a giant image in
  Word. Called out as a known limitation.
- Changing the continuous (default) layout mode at all.
- Changing the print/export `PaginatedDocument` path.
- Header/footer EDITING. Running headers/footers remain the existing
  section-config text, rendered into the page chrome.

## Architecture

Three cooperating VIEW-layer pieces. None mutate the document.

### 1. Pure layout helper (extends the existing engine)

Add one pure, unit-tested function alongside the existing engine:

```
computePageLayout(
  blockHeights: number[],          // raw outer height per top-level block
  forcedBreakBefore: Set<number>,  // block indices preceded by a manual pageBreak
  geo: { usableHeight, topMargin, bottomMargin, gutter, pageHeight },
) => {
  breakBeforeBlock: number[]       // block indices that start a new page
  spacerHeights: Map<number, number> // blockIndex -> spacer height to insert before it
  pageBoxes: { top: number, height: number, oversized: boolean }[] // for the bg layer
}
```

- Break decision delegates to the existing greedy first-fit logic, extended to
  also break wherever `forcedBreakBefore` requires it (manual page breaks) and to
  reset the running height after a forced break.
- **Spacer height** for a break before block `i` that ends page N:
  `spacer = (usableHeight - usedOnPageN) + bottomMargin + gutter + topMargin`.
  - `(usableHeight - usedOnPageN)` fills the remainder of page N's text area, so
    the last block on page N stops short of the bottom margin — this is the
    bottom-margin guarantee.
  - `bottomMargin + gutter + topMargin` is the inter-sheet trough plus the next
    page's top margin, so block `i` lands at the top of page N+1's text area.
- **Page boxes** (for the background sheet layer) are the cumulative sheet
  rectangles: page 1 top = 0; each subsequent sheet top = previous top +
  previous sheet height + gutter; sheet height = `pageHeight`, or
  `blockHeight + topMargin + bottomMargin` for an oversized block's page.

#### Geometry verification (the math closes)

Let content-flow `y = 0` at the first block's top (which sits at sheet 1 top +
`topMargin`). Page-1 text area height = `usable = pageHeight - topMargin -
bottomMargin`. Blocks fill to `used <= usable`; the last block ends at `y = used`.

- Desired content-flow y of page-2's first block:
  `usable + bottomMargin + gutter + topMargin`.
- Spacer height = desired - used =
  `(usable - used) + bottomMargin + gutter + topMargin`. ✓ (matches above)
- Background sheet 2 top (container coords, origin at sheet1.top): `pageHeight +
  gutter`. Its text-area top = `pageHeight + gutter + topMargin`. In content-flow
  coords (origin shifted up by `topMargin`): `usable + bottomMargin + gutter +
  topMargin` = page-2 first block y. ✓ Content and background sheets align
  exactly.

This is why the approach is correct by construction, not by tuning.

### 2. ProseMirror pagination plugin (`src/lib/editor/extensions/pagination-live.ts`)

A Tiptap extension wrapping a ProseMirror plugin. Active only in paged mode
(reads paged-ness from extension storage/options; no-op otherwise).

**Measurement.** Read the raw outer height of each top-level block. The direct
children of `editorView.dom` map 1:1 to the top-level document nodes, so heights
come from consecutive `offsetTop` deltas (final block via `scrollHeight`), the
same technique already proven in `PaginatedDocument.measureSlotHeights`.
Measurement EXCLUDES our own spacer widgets — see idempotency.

**Forced + oversized.** Collect `pageBreak` node positions → map to the block
index they precede (`forcedBreakBefore`). Oversized blocks are handled by the
engine.

**Decorations.** For each break, insert ONE `Decoration.widget(pos, dom, {
side })` of the computed spacer height at the boundary before the breaking block.
Widgets are non-document atoms: the cursor steps over them, they never enter the
doc, they are invisible to Yjs and the markdown mirror. The spacer DOM is an
empty `contentEditable=false`, `aria-hidden` block of the given height.

**Plugin state.** Holds `{ pageBoxes, pageCount, decorations }`. The React layer
subscribes via `useEditorState` reading this plugin key (the same pattern
`PageCanvas` already uses for `docBreakInfo`).

**Recompute loop.**
- Trigger on `docChanged` transactions (debounced ~200ms) and on a
  `ResizeObserver` over the editor DOM (width/font changes). Re-measure when
  fonts/images settle (listen for image `load`, like `PaginatedDocument`).
- Apply via a **meta-only transaction** (`tr.setMeta(key, newState)`, zero doc
  steps) so it produces NO Yjs update and does not touch document history.
- **Idempotency (no reflow loop):** break decisions derive only from RAW block
  heights, which are independent of the spacers we inserted (spacers are widgets
  between blocks, not inside them, and are skipped during measurement). So a
  second measurement after spacers are placed yields identical raw heights →
  identical decorations. Guard: deep-equal the new decoration/geometry set
  against current plugin state and skip the dispatch when unchanged.
- **Collab safety:** the plugin maps its `DecorationSet` across every
  transaction (including remote ones) via `DecorationSet.map(tr.mapping,
  tr.doc)`, then schedules a debounced recompute. Our decorations and the
  y-prosemirror cursor decorations are independent decoration sets and coexist.

### 3. Background sheet layer + transparent foreground (paged branch of `PageCanvas.tsx`)

In paged mode only (continuous mode stays byte-for-byte as today, minus the dead
overlay band):

- The outer `.parchment-page` container's own paper background is dropped in
  paged mode; the container background becomes the workspace gutter
  (`var(--editor-gutter)`).
- A background layer (absolutely positioned, `z-index` below the contenteditable,
  `pointer-events: none`, `aria-hidden`) renders N discrete sheet rectangles from
  `pageBoxes`. Each sheet reuses the **`.parchment-page` paper look**
  (`background: var(--page-bg)`, border, shadow, rounded corners) so it themes
  identically to the read-only/print sheets — including dark page mode via the
  existing `[data-page-bg="dark"]` scope. No new theming code.
- The contenteditable sits on top, transparent. Spacer decorations have already
  pushed each block onto its sheet's text area, so NO text lives in the gutter
  region — there is nothing to occlude. This is the structural reason the prior
  CSS failures cannot recur.
- **Container padding stays = margins** (as today). The single content column's
  left/right padding gives every page its horizontal margins; the container's
  top padding gives page 1 its top margin and the bottom padding gives the LAST
  page its bottom margin. All intermediate pages' top/bottom margins come from
  the spacer terms (`topMargin` / the `(usable - used) + bottomMargin` fill).
  Background sheets are full page width, centered, matching the column.
- Running headers/footers/page-numbers and watermarks (existing section machinery)
  render from the same `pageBoxes` geometry into the sheet chrome / gutter,
  porting today's overlay rendering to real per-page offsets.

## Theming (dark page mode, v0.1.9 #8)

- Sheets are real `.parchment-page` elements → `background: var(--page-bg)`,
  which the theme flips dark and which `[data-page-bg="dark"]` already scopes for
  in-page chrome. The live sheets inherit this with zero extra work.
- Gutter = `var(--editor-gutter)`. The seam is the absence of a sheet (real
  background showing through the gap), not a painted band — so there is no
  light-on-dark band artifact.

## Hard cases

| Case | Handling |
|------|----------|
| Block taller than a page (image/table/code) | Greedy isolates it on its own page; that page's background sheet grows to `blockHeight + margins`; never split. |
| Manual `pageBreak` node | Forced break before the following block (`forcedBreakBefore`). |
| Section breaks (headers/footers/page numbers) | Resolved per page from `pageBoxes` offsets; ported from current overlay logic. |
| Watermarks | One overlay per sheet, as today, positioned from `pageBoxes`. |
| Live editing | Debounced recompute; one-frame staleness during fast typing is acceptable (Word reflows too). |
| Collab cursors / selection | Spacers are atom widgets; collab cursors are a separate decoration set; both coexist; caret/selection positions unaffected. |
| Mid-block split of a tall table/paragraph | OUT of scope v1 (atomic blocks); documented limitation. |
| Very large documents | O(blocks) measure + greedy per recompute, debounced and skipped when height-unchanged. Acceptable v1; incremental measurement is a future optimization. |

## Files

- **New:** `src/lib/editor/extensions/pagination-live.ts` — Tiptap extension +
  ProseMirror plugin (measurement, decorations, recompute, plugin state).
- **New (pure):** `computePageLayout()` added to `src/lib/editor/pagination/`
  (e.g. `page-layout.ts`) + unit tests.
- **Extend:** `computeBreakIndicesVariable()` (or a thin wrapper) to honor
  `forcedBreakBefore` for manual page breaks + unit tests.
- **Rewrite (paged branch only):** `src/components/editor/PageCanvas.tsx` —
  background sheet layer driven by plugin geometry; port headers/footers/
  watermarks; continuous mode unchanged.
- **Wire:** `src/components/editor/Editor.tsx` — register the extension and pass
  paged-ness; it already threads `pageLayoutMode`.
- **CSS:** add live paged sheet/gutter rules (in `src/styles/pagination.css`,
  alongside the read-only sheet styles); **delete** the failed translucent-band
  block at `globals.css:1053-1125` and the now-unused continuous-canvas paged
  overlay rules.
- **Untouched:** `PaginatedDocument.tsx`, print/export path, continuous mode.

## Testing & verification

### Automated (TDD)

- `computePageLayout()` pure unit tests: spacer-height math, bottom-margin
  guarantee, cumulative page boxes, oversized-block page growth, forced breaks,
  empty doc, single oversized block.
- `forcedBreakBefore` engine extension unit tests.
- Keep DOM/measurement code thin (it delegates to the tested pure helper).

### Live browser verification (REQUIRED — user acceptance gate)

On a real multi-page document (≥2 pages, including at least one oversized
block), in BOTH light and dark page modes, confirm:

1. Discrete sheets with a visible grey gutter gap + sheet shadows between them.
2. Page 1 content stops above its bottom margin; page 2's first block starts at
   the top of the new sheet's text area.
3. No text is occluded anywhere; nothing is painted over a line.
4. Breaks fall on block boundaries (never mid-line).
5. Oversized block sits on its own page without being split.
6. Typing near a boundary re-paginates correctly (debounced) and the caret
   behaves (steps over the gutter, no trapping).
7. Dark page mode: sheets are dark paper, gutter reads as the trough — no light
   band.
8. Manual page break forces a new sheet; running header/footer/page-number and
   watermark still render.

Deliver screenshots (light + dark, multi-page) to the user. The user will reject
anything that occludes text or does not look like discrete Word pages.

## Risks & de-risk order

The break decision + themed-sheet rendering are proven in-repo (read-only path).
The unproven part is driving them from a live contenteditable. Highest-risk
unknowns, to validate earliest during implementation:

1. **Reflow idempotency** — confirm raw-height measurement is stable after
   spacers are inserted (no thrash). Mitigation: measure excluding spacers +
   deep-equal guard.
2. **Caret/selection over large atom-widget spacers** — confirm the cursor steps
   cleanly across the gutter and selection drag works.
3. **Collab decoration mapping** — confirm our decorations survive remote edits
   and don't disturb y-prosemirror cursors.
4. **Measurement timing** — fonts/images settling before measuring (reuse the
   existing two-rAF + image-load approach).

Recommended build order: pure helper (TDD) → minimal plugin proving one spacer +
background sheets on a 2-page doc, verified live light+dark → then
headers/footers/watermarks/manual-breaks/oversized → full verification.

## Rollout

No schema/data migration (view-layer only). Behavior gated behind the existing
`pageLayoutMode === 'paged'` setting, so continuous mode (the default) is
unaffected. Ship on a release branch.
