# Plan L — layout drift (7 tiers)

> ⛔ **HOLD.** No code until GO. Grounded vs the v0.1.2 code (file:line + current value +
> target). **Mostly CSS value changes**; the few needing JSX/logic are flagged
> PARTIAL-risk. **Reproduce-first on the redeployed build** (DOM computed-style probe +
> screenshot) before each change — several items are ALREADY correct in code (stale-deploy
> candidates), and the C2 lesson forbids closing on a code-read. S1 tokens only, no raw hex.

Format per item: **current** (grounded file:line) → **probe** (DOM/computed-style) →
**fix** (file:line + value). Light AND dark live-deploy screenshot per restyled surface.

---

## LT1 — high-impact

**LT1-1 🌐 — Kill the 24px white sliver above the title bar (flush to viewport top).**
current: no explicit padding on `.parchment-titlebar`; the `.parchment-editor-shell`
`padding:2rem` (`globals.css:395`) pushes the sticky stack down ~24-32px. probe: DevTools —
measure the gap from viewport-top to `.parchment-titlebar` top edge on the deploy. fix:
cancel the shell's top padding for the chrome — `margin-top:-2rem` on
`.parchment-chrome-stack` (or set the shell `padding-top:0` and move the gutter to the
canvas). Verify the title bar sits flush at `top:0`.

**LT1-2 — Compress the outline→page gutter so the page can reach ~816px.**
current: outline fixed 256px (`:1926`), canvas `flex:1`; at 1200px the page gutter is
~64px each side. probe: at 1200px viewport, measure the gap each side of `.parchment-page`.
fix: outline 256→**220px** (LT2-2) widens the gutter; the page re-centers via its `mx-auto`
— target ~80px outline-to-page, page up to 816px @100%.

**LT1-3 ⚠ — Toolbar overflow `⋯` chip styling.**
current: the overflow `<Menu label="More">` EXISTS + works (`Toolbar.tsx:1289`,
`more_horiz` glyph) but renders as a plain `.parchment-toolbar-btn` (transparent), not a
chip. probe: narrow to ~768px → the `⋯` appears; inspect its bg/border (transparent today).
fix (CSS-only, overflow logic untouched): add `.parchment-toolbar-overflow-btn` →
`background:var(--surface-muted); border:1px solid var(--border-chrome); border-radius:6px`
(32px height preserved). PARTIAL only if the chip look can't fully match — name it.

**LT1-4 — Vertical 1px separators between toolbar groups.**
current: **already implemented** — `.parchment-toolbar-sep` (`globals.css:1176`, 1px×20px
`--border`) rendered at 21 sites in `Toolbar.tsx`. probe: screenshot the toolbar; confirm
the dividers are visible (and `--border` resolves to a visible `#E8EAED`). fix: likely a
**confirm, not a change**; if a group boundary is missing a sep, add the `<span
className="parchment-toolbar-sep">` there. Verify the spec grouping (Undo/Redo | Print… |
Styles | Font/Size | B/I/U/S/colors | Link/Comment/Image | Align/Spacing/Lists/Indent |
Mode) reads cleanly.

**LT1-5 — Mode dropdown toolbar-right (= CF7).** Covered by **CF7** — already shipped
right-aligned (`Toolbar.tsx:1308`, `margin-inline-start:auto`). Reproduce-first per CF7.

---

## LT2 — page + outline

**LT2-1 — Page top margin 120→96px.** current: `.parchment-canvas-gutter` `padding-top:24px`
(`:768`) + shell `2rem` → ~120px to page-top. probe: measure viewport-top → `.parchment-page`
border-top. fix: `padding-top` 24→**0** (keep bottom 24px); lands ~96px.

**LT2-2 — Outline width 256→220px.** current: `.parchment-outline` width/min/max 256
(`:1926-1928`). probe: inspect computed width. fix: → **220px** (all three). (Optional
`@media (max-width:1100px)` if a responsive shrink is wanted — else static 220.)

**LT2-3 — Outline chevron 8px right pad.** current: `.parchment-outline-toggle` `right:6px`
(`:1951`). probe: measure chevron-to-divider distance. fix: `right` 6→**8px**.

**LT2-4 ⚠ — Outline-top == page-top.** current: outline sticky `top:136px` (`:1921`); its
heading list starts ~166px; page-top ~168px after LT2-1 → ~2px off. probe: eyeball/measure
the outline-first-heading vs page-`<h1>` vertical alignment. fix: tweak
`.parchment-outline-header` padding −2px if exact alignment wanted. PARTIAL: it's a ~2px
optional polish, not functional — name if skipped.

---

## LT3 — title bar / menu bar / toolbar microspacing

**LT3-1 ⚠ — Title-bar left cluster spacing 12/16/24px.** current:
`.parchment-titlebar-inner gap:8px` uniform (`:436`). probe: measure glyph→title, title→star,
star→move. fix (CSS+JSX): drop the uniform gap, add per-element margins (glyph→title 12px,
title→star 16px, star→move 24px) in `DocTitleBar.tsx`. PARTIAL: confirm the exact values
against the live design before committing (terse spec).

**LT3-2 — Save-status 13px medium.** current: `.parchment-titlebar-savestatus` `font:400
12px` `color:--muted` (`:496`). probe: inspect font-size/weight. fix: `font:500 13px`
(color already `--muted`).

**LT3-3 — Doc icon 32px.** current: `.parchment-titlebar-glyph` **already 32×32** (`:444`);
glyph inside 24px. probe: inspect the glyph box (expect 32px). fix: **confirm**; only bump
the inner glyph (24→28) if the spec wants a larger symbol.

**LT3-4 — Title Google Sans 18px semibold.** current: `.parchment-titlebar-title` `font:400
18px var(--font-ui)` (`:458`). probe: inspect weight (400 today). fix: `font:600 18px`
(family already `--font-ui` → Google Sans/Roboto).

**LT3-5 — Menu bar 24px left pad + 14px + gaps.** current: `.parchment-menubar-inner`
`padding:0 8px`; items 14px Roboto, 8px each side (`:537,:546`). probe: measure left-edge→
File. fix: `padding:0 8px 0 24px` (left 24). Font/gaps already correct.

**LT3-6 ⚠ — Title-bar right cluster 8px between icons + 16px before Share.** current: all
8px via container gap (`:436`); no explicit pre-Share margin. probe: measure icon-icon and
icon-Share gaps. fix: `.parchment-titlebar-share { margin-left:16px }` (icons keep 8px).
PARTIAL: confirm 8-vs-16 intent against the design.

---

## LT4 — global sidebar

**LT4-1 — Active-row pill bg `#E8F0FE`.** current: **already** `bg-[var(--primary-surface)]
text-[var(--primary-surface-text)]` on the active row (`NavRow.tsx:38`); token = #E8F0FE
light / #283142 dark. probe: select a nav row on the deploy; inspect the pill bg. fix:
**confirm** (= LT6-1); if missing on the deploy it's stale.

**LT4-2 ⚠ — Icon-to-text baseline align.** current: `items-center` flex; Material Symbols
`line-height:1` can baseline-drift vs the 14px label (`NavRow.tsx:43`). probe: inspect icon
vs label vertical centers. fix: add `align-middle`/`leading-none` to the icon span. PARTIAL:
font-load/browser-dependent — test Chrome + Safari.

**LT4-3 ⚠ — Pin bottom cluster to viewport bottom (kill the ~150px gap).** current: sidebar
flex-col, bottom cluster `mt-auto` (`layout.tsx:85`) but a gap remains. probe: measure
Settings-row → cluster gap on the deploy. fix: `justify-between` on the sidebar flex (or
pin the cluster) so it sits at the bottom; nav flows top-down. PARTIAL: restructuring risks
other alignments — verify the whole sidebar after.

**LT4-4 — +New width ~220px.** current: `NewMenu.tsx` button `w-full`; the menu
`min-w-[224px]` (`:97`). probe: inspect the +New button/menu width. fix: button stays
`w-full`; menu `min-w-[224px]`→**`w-[220px]`** (constrain).

**LT4-5 ⚠ — Bottom-cluster 12px row density.** current: cluster `gap-1` (4px) (`layout.tsx:85`).
probe: measure inter-row gap + row heights. fix: `gap-1`→**`gap-3`** (12px `--space-3`) +
audit child paddings (LocaleSwitcher/HelpMenu/SignOut). PARTIAL: child components have own
sizing — coordinate.

---

## LT5 — bottom status bar

**LT5-1 — Height 32→24px.** current: `.parchment-status-bar` **already 24px** (`:987`).
probe: inspect computed height on the deploy. fix: **confirm** (stale-deploy candidate); no
change if 24px live.

**LT5-2 ⚠ — Mode indicator before the connection dot.** current: status-bar right slot =
connection dot + label only (`StatusBar.tsx:85`); no mode shown. probe: inspect the right
slot. fix (NEW logic): thread the editor mode (Editing/Suggesting/Viewing) → a `mode` prop
on `StatusBar`; render a `--muted` label before the dot. PARTIAL: mode state lives in the
editor — wire the prop down.

**LT5-3 ⚠ — Word-count "116 words" default; "·792 chars" behind the modal.** current:
`StatusBar` center shows `words · chars` always (`:44`); `onOpenWordCount` opens a modal.
probe: inspect the center text. fix: default to **words only**; move chars into the
Word-count modal. PARTIAL: the modal component is elsewhere — locate + add chars there.

**LT5-4 — 24px L/R padding.** current: `.parchment-status-inner padding:0 16px` (`:1003`).
probe: inspect padding. fix: 16→**24px** (`var(--space-6)`).

---

## LT6 — files page

**LT6-1 ⚠ — Active row pill `#E8F0FE` (= LT4-1).** current: selected rows use
`bg-[var(--selection-bg)]` (#D2E3FC/#394457) across list/grid/details
(`FileManager.tsx:1600,1690`), NOT `--primary-surface`. probe: select a row; inspect bg.
fix: → `bg-[var(--primary-surface)]` to match the sidebar pill, text →
`--primary-surface-text`. PARTIAL: this changes the **selected-row semantics** (currently
`--selection-bg`) across all 3 views + contrast — verify dark + AA; decide if "selected"
should differ from "active".

**LT6-2 — Row hover `#F1F3F4`/`#28292C`.** current: details rows hover `--surface-hover`
(`:1602`); the all-view rows have **no hover bg** (`:1690`). probe: hover a recents/starred
row. fix: add `group-hover/row:bg-[var(--surface-hover)]` to the all-view row (#F1F3F4 light
/ #3C4043 dark via the token).

**LT6-3 ⚠ — Sort-chip restyle (light/dark).** current: sort select `border-[var(--border)]
bg-[var(--surface)] text-[var(--foreground)]` (`:617`). probe: inspect the chip
border/bg in both schemes. fix: scheme-aware — light `border #DADCE0 / bg white / text
#3C4043`, dark `border #5F6368 / bg transparent / text #E8EAED` (prefer tokens; a
`.parchment-sort-chip` class). PARTIAL: confirm "white" = literal vs `--surface`, and a dark
transparent fallback for contrast.

**LT6-4 — List/Grid/Details active contrast.** current: active segmented button **already**
`bg-[var(--primary-surface)] text-[var(--primary-surface-text)]` (`:656`). probe: click each;
verify the active button is readable (AA). fix: **confirm**; no change if AA passes.

**LT6-5 — Date column left-align fixed-width.** current: Modified/Created `<td>` `text-xs
--muted whitespace-nowrap`, no fixed width (`:1626`). probe: Details view; check the date
column width stability. fix: add `w-24` (96px) fixed width + explicit `text-left`.

---

## LT7 — share dialog

**LT7-1 ⚠ — Full URL select-all-on-click or hide.** current: `.parchment-share-list-url`
static `<code>`, ellipsis, no select/copy affordance (`ShareDialog.tsx:462`). probe: open
the dialog with an active share; click the URL — nothing selects. fix: add a click handler
using the **Selection API** (`window.getSelection()` + range — NOT deprecated
`execCommand`) to select-all, with `cursor-pointer`; OR hide the URL behind the Copy button.
PARTIAL: pick one approach; Selection-API browser-test.

**LT7-2 ⚠ — Collapse two Copy buttons to ONE.** current: a primary "Copy link"
(`ShareDialog.tsx:446`) AND a per-row Copy in existing-links (`:472`). probe: open the
dialog; count Copy buttons (≥2). fix: remove the per-row Copy (`:472`); the existing-links
row becomes status + Revoke only; keep the single primary "Copy link". PARTIAL: verify the
single-button flow stays discoverable.

**LT7-3 — Share URL fix (= CF4).** The client already uses the API-returned `url`
(`ShareDialog.tsx:226`); the fix is **backend CF4** (PUBLIC_URL). Covered by CF4 —
verify the copied link host on the deploy.

---

## Coverage check
- **Pure CSS value changes (low-risk):** LT1-1/2, LT2-1/2/3, LT3-2/4/5, LT4-4, LT5-4,
  LT6-2/5 — file:line + new value grounded.
- **Already-correct-in-code (confirm, stale-deploy candidates):** LT1-4, LT1-5(=CF7),
  LT3-3, LT4-1, LT5-1, LT6-4 — **reproduce-first + live screenshot; never close on the
  code-read (C2 lesson).**
- **New logic / JSX / semantics (PARTIAL-risk):** LT1-3 (chip), LT2-4 (align), LT3-1/3-6
  (cluster spacing), LT4-2 (baseline), LT4-3 (pin), LT4-5 (density), LT5-2 (mode indicator),
  LT5-3 (word-count split), LT6-1 (active-pill semantics), LT6-3 (sort chip), LT7-1/7-2.
- **Cross-refs:** LT1-5 = CF7 · LT7-3 = CF4 · LT6-1 = LT4-1 (one fix, two surfaces — apply
  to both NavRow + FileManager).
- **Tokens:** active pill `--primary-surface`/`--primary-surface-text`, hover
  `--surface-hover`, borders `--border-chrome`/`--border`, gutter `--editor-gutter`, spacing
  `--space-*` — no raw hex (the sort-chip is the one place literals may be unavoidable;
  prefer tokens, document if not).

## Newly-discovered gaps / scoping flags
- **The "already correct" cluster is the deploy-state tell.** ~6 LT items + CF3/CF5/CF7 are
  already right in code → strongly suggests the deploy is stale. The redeploy + per-item
  reproduce-first resolves each; expect several to close as "verified, no change" WITH a
  screenshot.
- **LT6-1/LT4-1 active-pill semantics** — file rows currently use `--selection-bg` (a
  distinct "selected" meaning). Unifying to `--primary-surface` is a deliberate semantic
  change; confirm with the design that selected==active is intended.
- **LT5-2/LT5-3 + CF7** all touch the editor mode state — sequence them so the mode
  source-of-truth is threaded once (toolbar dropdown → status indicator → read-only view).

## Failure-modes-verified
- **Closing on a code-read:** FORBIDDEN for the already-correct items — live screenshot
  required (C2 lesson).
- **Stale baselines:** every LT item updates its light+dark live-deploy screenshot; the
  Playwright visual baseline is controller-local.
- **Active-pill contrast (LT6-1):** `--primary-surface-text` on `--primary-surface` must
  pass AA in light AND dark across list/grid/details (the v0.1.1 active-pill contrast
  lesson).
- **Sticky-stack regression (LT1-1):** flushing the title bar must not break the
  L1/L2/L7 sticky offsets (title 0 / menu 56 / toolbar 88) or the S2-6 narrow path.
- **Sidebar restructure (LT4-3):** pinning the bottom cluster must not misalign the nav rows
  or the +New button — verify the whole sidebar light+dark after.
- **Word-count split (LT5-3) / mode indicator (LT5-2):** the chars must actually appear in
  the modal (not just be removed from the bar); the mode label must reflect the LIVE mode.
- **Share-dialog single-button (LT7-2):** the remaining Copy must still copy the
  origin-correct (CF4) URL; the URL select-all (LT7-1) uses the Selection API, not
  execCommand.
- **Live-deploy, both schemes:** every LT surface screenshotted light+dark on the deploy —
  no `DONE` on localhost.
