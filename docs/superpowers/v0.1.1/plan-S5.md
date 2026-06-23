# Plan S5 — Interactions, file manager polish, landing

> ⛔ HOLD. Run last. Interaction states, Drive-parity file manager, landing redirect,
> copy revisions — the polish that ties S1–S4 together.

**Intent:** make every interactive element feel Google (hover/pressed/disabled +
tooltips + dropdown elevation), bring the file manager to Drive parity, redirect the
landing, and clean the copy.

**Likely files:** shared interaction-state CSS (consume S1 tokens), a `Tooltip`
component, a shared `Dropdown` surface (used by S2 mega-menu + S3 menus + here),
`FileManager.tsx` (rows/sort/view/tags/selection), a new doc/folder glyph SVG
component, `src/app/page.tsx` (landing redirect), copy strings across in-app surfaces.

---

### S5-1 — Hover / pressed / disabled states (every interactive element)
Hover: 8px rounded `#F1F3F4` pill. Pressed/active: `#E8F0FE` pill + `#1A73E8`
text/icon. Disabled: 38% opacity, no pointer events. **Accept:** every button/row/
icon shows the three states; disabled is non-interactive.

### S5-2 — Tooltips (every icon-only control)
12px Roboto, `#3C4043` bg, white text, 300ms delay — toolbar, title bar, sidebar
bottom cluster. **Accept:** hovering any icon-only control shows a labelled tooltip
after 300ms; keyboard-focus also surfaces it (a11y).

### S5-3 — Dropdown elevation
`box-shadow:0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15)`, 8px
radius, white bg, 14px Roboto items, 36px rows, hover `#F1F3F4`. **Accept:** all
dropdowns (S2 mega-menu, S3 menus/toolbar dropdowns, file-row ⋯) share this elevation.

### S5-4 — File manager — Drive parity
Drop top tab strip (S2-4). Doc rows use a blue Docs-style paper glyph (small SVG
component); folders use Material `folder` `#5F6368`, starred `#FFD180`. Drop emoji
icons. Sort chip ("Name ↑") + segmented icon-only View toggle (List/Grid/Details),
right-aligned; drop dark defaults. Tag color → 6px square dot LEFT of the name (smaller).
⋯ per-row hidden until row hover. "+ New folder" folds into the S2-1 "+ New" mega-menu
(remove the standalone purple button). Smart folders / Tags indented under the tree,
smaller headers. **Accept:** file list reads as Drive; no emoji/purple; ⋯ on hover only.

### S5-5 — File-row selection states
Single click selects (`#E8F0FE` bg) · double click opens · shift-click range ·
⌘-click multi · right-click context menu. **Accept:** each gesture behaves as stated;
selection bg is the blue pill.

### S5-6 — Landing redirect
`/` → `/files`. Drop the "Open files / Health" centered card entirely. Health stays
via Settings → Admin → Health. **Accept:** hitting `/` lands on `/files`; no centered card.

### S5-7 — Files page hero
H1 → "My Drive" (or "My Files") at 22px Google Sans regular; drop the subtitle.
**Accept:** files hero is the new title at 22px; no subtitle.

### S5-8 — Copy revisions
"+ New document" → "Blank document" (New mega-menu) · "+ New folder" → "Folder"
(mega-menu) · drop "v0.1.0 — single-user preview" from the landing (version → Help →
About) · drop "Markdown-first writing, page-bounded canvas, real-time collab.
Self-hosted." from in-app surfaces. **Accept:** the strings are gone/relabelled;
version only in Help → About.

### S5-9 — Save-status microcopy (title bar, S3-1)
"Saving…" → "All changes saved to disk" → (5-min idle) "Last edit was N minutes ago".
**Accept:** the three states render at the right moments on the deploy.

### S5-10 — Editing-mode dropdown (toolbar right end, S3-3)
Editing / Suggesting / Viewing — matching Google Docs (wired to the existing D2
suggesting mode + a read-only view). **Accept:** the dropdown switches modes; Suggesting
routes edits through the existing track-changes; Viewing is read-only.

---

## Coverage check
- Audit gaps closed: flat/no interaction feedback (S5-1/2/3), non-Drive file manager
  (S5-4/5), landing card + stale copy (S5-6/7/8), save-status + mode affordances
  (S5-9/10).
- Cross-plan: S5-1/3 colors from S1, pills/icons sized by S4-4/S4-3; S5-4 tab-strip
  removal pairs with S2-4; the New mega-menu lives in S2-1 (S5-4/S5-8 supply its
  items + copy); S5-9 copy fills the S3-1 save-status slot; S5-10 dropdown is placed
  by S3-3 and drives the existing suggesting/viewing modes (no new logic). The shared
  `Dropdown` (S5-3) is the same surface S2/S3 menus use — build once.
- Out of scope: new file-manager *capabilities* — S5 restyles existing E-plan
  features (views, tags, selection, context menu already exist); only look/feel changes.

## Failure-modes-verified
- **Selection-gesture regressions** (the existing E6 bulk-select + E7 context menu
  must keep working) → Playwright drives single/double/shift/⌘/right-click and
  asserts each result; no broken bulk-ops.
- **Landing redirect loop / auth** (`/` → `/files` when unauthed must still reach
  `/login`, not loop) → unauthed + authed both verified on the deploy.
- **Tooltip a11y** (icon-only controls need an accessible name even with a tooltip) →
  axe asserts each icon-only control has an aria-label; tooltip is supplementary.
- **Copy-removal completeness** (a stale string left on one surface) → grep the removed
  strings across `src/` returns zero; live screenshots of landing + editor + files confirm.
- **Mode dropdown vs suggesting plugin** (the G13 lesson — programmatic edits not
  tracked) → Suggesting mode routes through the existing D2 marks; verify an edit in
  Suggesting renders as a tracked change, not a silent commit.
- **Emoji/glyph swap** (a row losing its icon) → file-list snapshot; every doc/folder
  row shows the new SVG/Material glyph, none blank.
