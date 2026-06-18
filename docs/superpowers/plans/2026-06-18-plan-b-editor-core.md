# Plan B — Editor Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A markdown-first, page-bounded Tiptap editor at `/d/[id]` with the full Plan B feature set (B0–B14), each item shipped as its own PR into `release/v0.1.0`.

**Architecture:** Tiptap v3 / ProseMirror editor bound to a `Y.Doc` (Yjs-from-start so Plan D drops in the network provider). Y.Doc binary → `collab_state` (`doc:<id>`); ProseMirror JSON → `documents.content`; canonical markdown → `documents.markdown`. Page-width "paper" canvas with computed break markers; paged.js for print/PDF only.

**Tech Stack:** Next.js 16 RSC + client editor island, Tiptap v3, Yjs, Drizzle/Postgres, Tailwind, Vitest + Testcontainers, Playwright + axe-core.

## Global Constraints

- TypeScript 6 strict (noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax). Path alias `@/*`.
- Biome: single quotes, no semicolons, 2-space, width 100, imports sorted.
- Pin newest stable for every new dep (`npm view <pkg> version`); exact versions in package.json.
- CSS vars only for color; white text only on `var(--accent-contrast)` (axe WCAG2 A/AA gated).
- Editor route is auth-gated (A2); authed Playwright project (seeded session storageState) covers it.
- Per-item workflow: branch `feat/B<n>-<slug>` off `release/v0.1.0` → TDD → full gate (typecheck, biome, build, vitest, playwright/axe, browser screenshot) → `gh pr create` → squash-merge when green → delete branch → update `scope.md`.
- No item DONE in scope.md until browser-verified on the running app.

---

## Task B0: Document lifecycle + editor foundation

**Files:**
- Create: `src/lib/editor/tiptap-extensions.ts` (shared StarterKit config)
- Create: `src/components/editor/Editor.tsx` (`'use client'` Tiptap island)
- Create: `src/lib/markdown/serialize.ts` (PM JSON → markdown), `src/lib/markdown/parse.ts` (markdown → PM JSON)
- Create: `src/lib/docs/repo.ts` (createDocument, getDocument, saveDocument, listDocuments — server, uses `db`)
- Create: `src/app/api/docs/route.ts` (POST create, GET list), `src/app/api/docs/[id]/route.ts` (GET, PUT autosave)
- Modify: `src/app/(app)/d/[id]/page.tsx` (load doc → render Editor)
- Modify: `src/app/(app)/files/page.tsx` (minimal "+ New document" + list — stopgap for Plan E)
- Test: `tests/integration/docs.test.ts` (Testcontainers: create→save→get round-trip), `tests/unit/markdown.test.ts` (serialize/parse round-trip)

**Interfaces:**
- Produces: `createDocument(ownerId, {title?, folderId?}) → {id}`; `saveDocument(id, {contentJson, markdown}) → void`; `getDocument(id) → Doc|null`; `listDocuments(ownerId) → DocSummary[]`; `serializeMarkdown(json) → string`; `parseMarkdown(md) → json`.
- Consumes: `db, schema` from `@/db`; `requireUser` from `@/lib/auth/guard`.

**Decisions:**
- For B0, persist ProseMirror JSON + markdown on autosave (PUT `/api/docs/[id]`). Yjs `Collaboration` extension wires the editor to an in-memory `Y.Doc` seeded from the stored JSON via `Y.applyUpdate`/`prosemirror-to-y`; the Y.Doc binary is persisted opportunistically to `collab_state` but JSON remains the load source until Plan D. Keep the seam: `Editor` accepts `docId` + initial JSON and an `onChange(json, markdown)` debounced autosave.
- Autosave debounce 800ms typing + flush on blur; server PUT updates `content`, `markdown`, `updatedAt`. (I3 slider later overrides the 30s snapshot cadence; live autosave stays 800ms.)

- [ ] **Step 1 (RED):** `tests/unit/markdown.test.ts` — `serializeMarkdown(parseMarkdown('# Hi\n\n**b**'))` equals normalized `'# Hi\n\n**b**\n'`; round-trip for headings, bold/italic, lists, blockquote, code block.
- [ ] **Step 2:** run `pnpm vitest run tests/unit/markdown.test.ts` → FAIL (module missing).
- [ ] **Step 3:** implement `serialize.ts`/`parse.ts` using `prosemirror-markdown` (or Tiptap's markdown) mapped to the StarterKit schema. Pin newest stable dep.
- [ ] **Step 4:** vitest green.
- [ ] **Step 5 (RED):** `tests/integration/docs.test.ts` — Testcontainers PG (mirror `audit.test.ts` setup incl. `closeDb()` teardown): `createDocument` then `saveDocument` then `getDocument` returns the saved markdown + content; `listDocuments` includes it.
- [ ] **Step 6:** implement `src/lib/docs/repo.ts` + the two API routes; integration test green.
- [ ] **Step 7:** build `Editor.tsx` (Tiptap `useEditor` with StarterKit + Collaboration on a `Y.Doc`), wire `/d/[id]/page.tsx` to load the doc (server) and pass JSON to the client island; minimal `/files` New+list.
- [ ] **Step 8 (gate + PR):** typecheck/biome/build/vitest green; Playwright: authed `/d/[id]` loads, type text, reload restores; axe `/d/[id]` zero violations; browser screenshot. Open PR `feat/B0-doc-foundation`, auto-merge when green.

---

## Task B1: Page-bounded canvas

**Files:** Create `src/components/editor/PageCanvas.tsx`, `src/lib/editor/paginate.ts`, `src/components/editor/StatusBar.tsx`; Modify `Editor.tsx` (wrap content in PageCanvas), `src/app/globals.css` (page CSS vars).
**Interfaces:** Produces `measurePageBreaks(contentEl, {pageHeightPx, marginPx}) → number[]` (Y offsets); `PageSize` type (`Letter|A4|Legal|Tabloid|Custom`) with px dims at 96dpi.

- [ ] **RED:** `tests/unit/paginate.test.ts` — `measurePageBreaks` with a stubbed element of height 2000px and pageHeight 1056px (11in) returns `[1056]` (one break); height 3200 → `[1056, 2112]`.
- [ ] Implement measurement (content height ÷ usable page height; ResizeObserver-driven in the component).
- [ ] PageCanvas: 816px-wide paper (`var(--page-w)`), 1in padding, dashed break markers at computed offsets, A4 toggle. StatusBar shows "Page X of Y".
- [ ] **Gate + PR** `feat/B1-page-canvas`: axe `/d/[id]`, screenshot showing a page-break marker past one page.

---

## Task B2: Inline formatting bar

**Files:** Create `src/components/editor/BubbleMenu.tsx`, `src/components/editor/Toolbar.tsx`, `src/lib/editor/extensions/font.ts` (FontFamily, FontSize, LineHeight, LetterSpacing marks/attrs), use Tiptap `@tiptap/extension-{underline,subscript,superscript,highlight,text-style,color}`.
**Interfaces:** Produces the extension array `inlineMarks` consumed by `tiptap-extensions.ts`.

- [ ] **RED:** `tests/unit/marks.test.ts` — applying each mark to a doc and serializing/reparsing preserves it (where markdown-representable; non-md marks persist in JSON).
- [ ] Implement marks + bubble/top toolbar buttons (B/I/U/S, sub, sup, code, highlight, color, font family, size pt+px, line-height, letter-spacing).
- [ ] **Gate + PR** `feat/B2-inline-format`: axe on toolbar + bubble menu (buttons have aria-labels), screenshot.

---

## Task B3: Block formatting

**Files:** extend `tiptap-extensions.ts` (Heading 1-6, Blockquote, CodeBlock w/ language attr, BulletList/OrderedList/TaskList+TaskItem, TextAlign, indent attr); Modify Toolbar.
- [ ] **RED:** `tests/unit/blocks.test.ts` — round-trip H1-H6, blockquote, ordered/bullet/task lists, code block with language attr; alignment + first-line-indent persist in JSON.
- [ ] Implement; manual language picker on code block (Shiki render deferred to Plan C — store `language` attr only).
- [ ] **Gate + PR** `feat/B3-block-format`.

---

## Task B4: Tables

**Files:** Create `src/lib/editor/extensions/table.ts` (Tiptap Table set + custom cell `formula` attr), `src/lib/editor/formula.ts` (evaluator), `src/components/editor/TableControls.tsx`.
**Interfaces:** Produces `evalFormula(expr, cells: Map<string,number>) → number | {error}`; supports `SUM/AVG/AVERAGE/COUNT` and ranges `A1:A10`.
- [ ] **RED:** `tests/unit/formula.test.ts` — `evalFormula('=SUM(A1:A3)', {A1:1,A2:2,A3:3})===6`; `=AVG(A1:A2)`===avg; `=COUNT(A1:A3)`===3; circular ref → `{error}` not a throw/hang.
- [ ] Implement evaluator (parse A1 refs + ranges, topological guard for cycles) + Table extension with resize/merge/header/alt-shade/sort.
- [ ] **Gate + PR** `feat/B4-tables`.

---

## Task B5: Images

**Files:** Create `src/lib/editor/extensions/image.ts` (custom Image node: alt required, position enum, width/lock), `src/app/api/docs/[id]/assets/route.ts` (upload → store under `${filesRoot}/.assets/<docid>/`, serve via API), `src/components/editor/ImageDialog.tsx` (alt-required + crop).
- [ ] **RED:** `tests/unit/image-node.test.ts` — inserting an image without `alt` is rejected by a guard helper `assertImageAttrs`; with alt it passes; position enum validated.
- [ ] Implement upload route (auth-gated, type/size check), node, dialog (alt required, crop via canvas), position modes (inline/wrap-left/right/break/behind), resize handles + lock aspect.
- [ ] **Gate + PR** `feat/B5-images`: axe (alt enforced), screenshot with a wrapped image.

---

## Task B6: Links

**Files:** extend Link extension; Create `src/components/editor/LinkPopover.tsx`, `src/app/api/docs/search/route.ts` (fuzzy doc title search).
- [ ] **RED:** `tests/integration/doc-search.test.ts` — `GET /api/docs/search?q=` returns title matches for the owner; `tests/unit/links.test.ts` — autolink input rule turns a pasted URL into a link mark.
- [ ] Implement named link, link-to-heading (heading id anchors), link-to-doc picker (calls search route).
- [ ] **Gate + PR** `feat/B6-links`.

---

## Task B7: Auto TOC

**Files:** Create `src/lib/editor/extensions/toc.ts` (TocNode), `src/components/editor/TocView.tsx`.
- [ ] **RED:** `tests/unit/toc.test.ts` — `collectHeadings(json)` returns ordered `{level,text,id}[]`; updates after a heading edit.
- [ ] Implement `/toc` node rendering the heading list with refresh + optional page numbers + leader dots.
- [ ] **Gate + PR** `feat/B7-toc`.

---

## Task B8: Footnotes + endnotes

**Files:** Create `src/lib/editor/extensions/footnote.ts` (Footnote mark + reference node), `src/components/editor/FootnoteList.tsx`.
- [ ] **RED:** `tests/unit/footnote.test.ts` — `[^1]` input rule creates a numbered footnote ref; serialize round-trips `[^1]` + definition; renumber on insert.
- [ ] Implement click-jump + footer/end-of-doc placement per section.
- [ ] **Gate + PR** `feat/B8-footnotes`.

---

## Task B9: Find + replace

**Files:** Create `src/lib/editor/extensions/search.ts` (ProseMirror search/replace decorations), `src/components/editor/FindReplace.tsx`.
- [ ] **RED:** `tests/unit/search.test.ts` — `findMatches(text, {query,caseSensitive,wholeWord,regex})` returns correct ranges; invalid regex → `{error}` (no throw).
- [ ] Implement decorations, replace/replace-all, scope selection/doc, ⌘F / ⌘⇧H.
- [ ] **Gate + PR** `feat/B9-find-replace`.

---

## Task B10: Word + character count

**Files:** Create `src/lib/editor/counts.ts`; Modify StatusBar.
- [ ] **RED:** `tests/unit/counts.test.ts` — `countText('hello world')` → `{words:2,chars:11}`; reading time = ceil(words/238) min; selection-scoped count.
- [ ] Implement live status bar counts + selection scope + reading time.
- [ ] **Gate + PR** `feat/B10-counts`.

---

## Task B11: Outline pane

**Files:** Create `src/components/editor/OutlinePane.tsx`; reuse `collectHeadings` (B7).
- [ ] **RED:** `tests/unit/outline.test.ts` — drag-reorder moves a heading subtree (`moveSubtree(json, fromId, toIndex)` keeps descendants together).
- [ ] Implement collapsible rail, click-jump, drag-reorder subtree.
- [ ] **Gate + PR** `feat/B11-outline`.

---

## Task B12: Slash menu

**Files:** Create `src/components/editor/SlashMenu.tsx`, `src/lib/editor/slash-items.ts` (categorized commands).
- [ ] **RED:** `tests/unit/slash.test.ts` — `filterSlashItems('tab')` returns the Table item; categories BASIC/TEXT/LISTS/MEDIA/EMBED/ADVANCED present.
- [ ] Implement `/` suggestion popup with left category rail, keyboard nav.
- [ ] **Gate + PR** `feat/B12-slash-menu`: axe (menu keyboard-reachable).

---

## Task B13: Page primitives

**Files:** Create `src/lib/editor/extensions/page-break.ts` (`/pagebreak` node), `src/lib/editor/extensions/section.ts` (section break + per-section header/footer attrs); Modify PageCanvas (render page numbers + running header/footer).
- [ ] **RED:** `tests/unit/page-primitives.test.ts` — a `pageBreak` node forces a new computed page; section attrs (header/footer text, margins) attach per section.
- [ ] Implement page numbers (footer, configurable format), running headers/footers per section, manual page break.
- [ ] **Gate + PR** `feat/B13-page-primitives`.

---

## Task B14: Page setup dialog

**Files:** Create `src/components/editor/PageSetupDialog.tsx`; Modify `paginate.ts` (size table), PageCanvas.
- [ ] **RED:** `tests/unit/page-sizes.test.ts` — `pageDims('A4','portrait')` and `'Legal'`, `'Tabloid'`, in/cm conversion correct at 96dpi.
- [ ] Implement dialog: unit toggle, custom margins, orientation per section, size Letter/A4/Legal/Tabloid/Custom; applies to PageCanvas.
- [ ] **Gate + PR** `feat/B14-page-setup`. Then mark B1–B14 + B0 DONE in scope.md (final B rollup commit).

---

## Self-review notes

- Spec coverage: B0 covers the foundation (not a numbered spec item but required); B1–B14 map 1:1 to spec items. ✓
- Shiki/auto-detect intentionally absent (Plan C). Lossless md hardening absent (Plan F). Full file manager absent (Plan E) — B0 ships a labeled stopgap. ✓
- Interfaces named consistently (`serializeMarkdown`/`parseMarkdown`, `measurePageBreaks`, `evalFormula`, `collectHeadings`, `countText`). ✓
- Tiptap v3 exact API (extension import paths, command names) is resolved at implementation time against the pinned version; tests assert behavior, not internal API.
