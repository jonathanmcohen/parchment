# Plan B — Editor Core (design spec)

Date: 2026-06-18 · Status: approved · Branch base: `release/v0.1.0`

Markdown-first, page-bounded writing surface built on Tiptap / ProseMirror. This
spec covers Plan B (items B0–B14). Each item ships as its own branch → PR → full
local gate → squash-merge into `release/v0.1.0`.

## Foundational decisions

1. **Editor:** Tiptap v3 + ProseMirror. Pin newest stable at build time.
2. **Yjs from the start.** The editor binds to a `Y.Doc` via Tiptap's
   `Collaboration` extension even though v0.1 is single-user, so Plan D drops in
   the Hocuspocus network provider with no editor rework.
   - Y.Doc binary state persists to `collab_state` keyed `doc:<id>` (table exists).
   - ProseMirror JSON → `documents.content` (jsonb) for SSR/preview.
   - Canonical markdown → `documents.markdown` (text) for disk-mirror (Plan F) + FTS.
   - Rejected alternative: plain ProseMirror state now, Yjs in D — forces
     re-testing all 14 features under Yjs later.
3. **B0 prerequisite — document lifecycle.** A real `/d/[id]` editor, a "New
   document" action, and debounced autosave (cadence from I3, default 30s + on
   idle/blur). Plus a **minimal** "+ New / document list" on `/files` so Plan B is
   usable end to end. The minimal list is an explicit stopgap that the full Plan E
   file manager replaces.
4. **Scope fences:**
   - Shiki syntax highlighting + language auto-detect = **Plan C**. B3 ships only
     the code-block node + a manual language attribute.
   - paged.js = **print/PDF only** (Plan H2), never on-screen pagination.
   - Lossless markdown round-trip = **Plan F3**. B builds a baseline serializer;
     F hardens it.

## Page canvas (B1) — chosen fidelity

Page-width "paper", continuous scroll, computed break markers. Not true live
on-screen pagination (deferred / out of scope for v0.1).

- US Letter default: 8.5×11in. At 96dpi the page box is 816px wide; 1in margins
  give a 768px text column. A4 toggle and per-section margin/orientation via the
  page-setup dialog (B14).
- A measurement pass computes page-break positions from content height and
  overlays dashed break markers + a live status line "Page X of Y · N words".
- paged.js renders true page boundaries only for print/PDF/export.

## Units

```
components/editor/
  Editor.tsx           Tiptap instance + extension wiring
  Toolbar.tsx          fixed top toolbar
  BubbleMenu.tsx       selection floating bar (B2)
  SlashMenu.tsx        '/' insert menu (B12)
  PageCanvas.tsx       page CSS + break measurement (B1, B13, B14)
  OutlinePane.tsx      heading rail (B11)
  StatusBar.tsx        page/word/char/reading-time (B1, B10)
  PageSetupDialog.tsx  margins/size/orientation (B14)
  extensions/          custom marks + nodes (fonts, footnotes, toc, formula, ...)
lib/markdown/          ProseMirror ⇄ markdown serializer/parser (baseline)
lib/editor/            pagination-measure · formula-eval · counts
app/api/docs/          CRUD · autosave · image upload
```

Each unit has one purpose, a typed interface, and is testable in isolation.

## Items and acceptance criteria

- **B0 Foundation** — create/open/autosave a doc on a Y.Doc; minimal docs list on
  `/files`. *Accept:* New document → `/d/[id]` opens an editable canvas; typing
  autosaves content+markdown; reload restores; doc appears in the list.
- **B1 Page canvas** — page-width paper, break markers, live page/word status, A4
  toggle. *Accept:* content past one page shows a break marker + correct page count.
- **B2 Inline formatting** — B/I/U/S, sub, sup, inline code, highlight, text color,
  font family, font size (pt+px), line height, letter spacing. *Accept:* each mark
  round-trips through the markdown/JSON store.
- **B3 Block formatting** — H1–H6, paragraph, blockquote, code block (+manual lang),
  bullet/ordered/task lists, multi-level outlines, alignment, first-line indent.
- **B4 Tables** — insert, resize cols, merge cells, header row, alt-row shade, sort
  by column, formula cells `=SUM/AVG/AVERAGE/COUNT`, ranges `A1:A10`. *FM:* circular
  reference → error cell, not a hang.
- **B5 Images** — upload/paste/drag, position (inline/wrap-left/wrap-right/break/
  behind), resize handles, crop, **alt text required on insert**, lock aspect.
- **B6 Links** — autolink, named link, link to in-doc heading, link to other doc
  (fuzzy picker).
- **B7 Auto TOC** — `/toc` block, refresh, optional page numbers + leader dots.
- **B8 Footnotes/endnotes** — `[^1]` input rule, numbered, click-jump, footer or
  end placement per section.
- **B9 Find + replace** — case/whole-word/regex, replace all, scope selection/doc,
  ⌘F / ⌘⇧H. *FM:* invalid regex → inline error, no crash.
- **B10 Counts** — live word/char in status bar, selection-scoped on highlight,
  reading-time estimate.
- **B11 Outline pane** — collapsible heading rail, click-jump, drag-reorder subtree.
- **B12 Slash menu** — `/` opens categorized insert (BASIC/TEXT/LISTS/MEDIA/EMBED/
  ADVANCED) with a left category rail.
- **B13 Page primitives** — page numbers (footer, configurable), running headers/
  footers per section, manual `/pagebreak`, section breaks.
- **B14 Page setup** — in/cm toggle, custom margins, orientation per section, size
  Letter/A4/Legal/Tabloid/Custom.

## Verification (per-item PR artifacts)

Every item PR carries: spec path · RED on branch base · GREEN on branch · live
screenshot of `/d/[id]` · axe-core zero-violations on the editor route. Plus:

- Unit tests (Vitest): markdown serialize/parse round-trip, formula evaluation,
  word/char counts, find/replace matching.
- e2e (Playwright): editor interactions (type, format, insert, dialogs).
- a11y (axe): `/d/[id]` and every editor dialog added to the authed a11y suite.

The editor route is gated behind auth (Plan A2), so the authed Playwright project
(seeded session storageState) covers it.

## Sequencing

B0 → B1 → B2 → … → B14. Each merges into `release/v0.1.0` when its full gate is
green. No item is marked DONE in `scope.md` until browser-verified.

## Out of scope for Plan B

Real-time collab/presence (D), Shiki render + auto-detect (C), lossless markdown
hardening (F), export/import (H), the full file manager (E), equations/diagrams/
drawings (G). B leaves clean seams for each.
