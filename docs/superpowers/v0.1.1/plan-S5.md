# Plan S5 — Interactions, file manager polish, landing

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ⛔  HOLD — SCAFFOLD COMPLETE, EXECUTION GATED. NO IMPLEMENTATION.         ║
║                                                                            ║
║  Run LAST (after S1–S4 merge). Do NOT branch, write code, or open a PR     ║
║  until the user replies "GO" on Plan S1 and S1–S4 have landed on           ║
║  release/v0.1.1. Banner is removed only on that signal.                    ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Intent:** make every interactive element feel Google (hover / pressed / disabled +
tooltips + dropdown elevation), bring the file manager to Drive parity, redirect the
landing, and clean the copy. Pure restyle / surface — **no new file-manager capability.**
Every color comes from the S1 token file (`src/styles/tokens.css`); nothing is hardcoded
after S1.

**Verified file set (this surface):**
- `src/app/page.tsx` — landing (hero, version badge, Open files / Health nav). **35 lines.**
- `src/app/(app)/files/page.tsx` — Files page wrapper (h1 "Files", "+ New document"). **49 lines.**
- `src/app/(app)/layout.tsx` — app shell (sidebar `w-56`, bottom cluster: name / locale /
  Help / sign-out). **91 lines.** S5-2 tooltips land on its icon-only controls; S2 owns its
  restyle, S5 only adds interaction states + tooltips.
- `src/components/file-manager/FileManager.tsx` — **2739 lines.** View switcher (L2087),
  left rail (L2119, `w-56`), "+ New folder" button (L2120), "↑ Import" (L2139), Root (L2193),
  folder tree (`FolderTreeItem`, 📁 at L546), Smart Folders header (L2213), Tags header
  (L2282) + tag dot (`w-2.5 h-2.5 rounded-full`, L2306–2310), sort toolbar (L588), view
  toggle (L617), `DocActions` (🏷 L900, ★/☆ L923, 🗑 L931, ⋯ L955), `DocListRow` (📄 L1222,
  checkbox `onClick` L1212), `AllViewDocRow` (📄 L1580, checkbox `onClick` L1565), grid 📄
  (L1386), details 📄 (L1498), `ContextMenu` (L799), `TagPopover` (L372), `TrashToolbar`
  (L1727), selection state (`handleToggle` L1827, `handleSelectAll` L1844).
- `src/lib/docs/context-actions.ts` — `docMenuItems()` (pure, unit-tested). Copy-only edits.
- `src/lib/docs/tag-colors.ts` — 8-color palette (`bg`/`fg`). S5-4 reuses `bg` for the dot.
- `src/lib/docs/doc-sort.ts` — `sortDocs()` (pure). Feeds the S5-4 sort chip label; no change.
- `src/app/globals.css` — global styles. S5-1 interaction-state utilities + S5-3 dropdown
  elevation land here (consuming S1 tokens).
- **NEW** `src/components/ui/Tooltip.tsx` (S5-2), **NEW** `src/components/ui/Dropdown.tsx`
  (S5-3, shared with S2/S3), **NEW** `src/components/file-manager/DocGlyph.tsx` +
  `FolderGlyph.tsx` (S5-4).

**Cross-plan dependencies (must already be merged):**
- **S1** — `src/styles/tokens.css` exists with the **canonical vocabulary** (see
  plan-S1.md). S5 uses ONLY those names: brand `--primary` (`#1A73E8`),
  `--primary-hover` (`#1765CC`), the active pill `--primary-surface` (`#E8F0FE`),
  `--on-primary`; the hover pill `--surface-hover` (`#F1F3F4`); selection
  `--selection-bg` (`#D2E3FC`); the gutter `--editor-gutter` (`#F1F3F4`); misc
  `--star`/`--tooltip-bg`; elevation `--shadow-dropdown`/`--shadow-dialog`; ink
  `--foreground`/`--muted`. **S5 references these by their canonical name — never a
  literal hex, and there is NO "reconcile at execution time" hedge** (S1 already
  decided every name). The retired names `--hover`/`--accent-pill`/`--accent-hover`/
  `--selection`/`--shadow-menu`/`--icon-muted`/`--text-title`/`--color-heading`/
  `--text-overline` do **not** appear in this plan.
- **S2** — the "+ New" mega-menu (S2-1) exists; S5-4/S5-8 supply its "Blank document" /
  "Folder" items. **The Files-page top tab strip is already deleted by S2-4 (sole
  owner, finding #18)** — S5-4 does NOT re-delete it (the current code's in-`FileManager`
  view-switcher `nav` is removed by S2-4).
- **S3** — the doc title bar (S3-1) hosts the S5-9 save-status slot **and owns its
  in-flight→settled→idle STATE** (Decision 4); S5-9 supplies the COPY only. The
  toolbar (S3-3) hosts the S5-10 mode dropdown.
- **S4** — type ramp + chrome type (Roboto 14px, Material Symbols 20px — **faces
  loaded by S1-8**) + 36px row / 32px icon-button spacing tokens. S5 sizes
  pills/icons by S4-3/S4-4, never re-specifies them.

> **Release-level prerequisite (not an S5 item):** the README's 7-surface
> visual-regression baseline harness does **not exist yet** — `tests/e2e/` has only axe
> specs (`a11y.public.spec.ts`, `a11y.authed.spec.ts`), zero `toHaveScreenshot`. The
> snapshot harness (`tests/e2e/visual.spec.ts` + committed `*-snapshots/`) is stood up by
> S1's first item per the README gate; S5 items below assume it exists and only
> add/update baselines. If it is still absent when S5 runs, **the first S5 PR must create
> it** (size: ~1 PR, +0.5 day) — flagged in "Newly-discovered gaps".

---

### S5-1 — Hover / pressed / disabled states (every interactive element)

**Files:** `src/app/globals.css` (new utility layer, consumes S1 tokens);
`src/components/file-manager/FileManager.tsx` (apply class to buttons/rows currently using
ad-hoc `hover:text-[var(--accent-contrast)]`); `src/app/(app)/layout.tsx` nav rows
(L70–77 currently `hover:bg-[var(--background)]`).

**Current → Target:**
- Current: scattered ad-hoc hovers — `hover:text-[var(--accent-contrast)]` (FileManager
  L543, L898, L1220, L1578, L2231, L2303), nav `hover:bg-[var(--background)]` (layout L73),
  no pressed state anywhere, disabled = `disabled:opacity-50` (FileManager L1133) /
  `opacity-50` (L2133). No unified interaction language.
- Target (audit S5-1): **Hover** → 8px-radius pill, bg `--surface-hover` (`#F1F3F4`).
  **Pressed/active** → 8px-radius pill, bg `--primary-surface` (`#E8F0FE`) + text/icon
  `--primary` (`#1A73E8`). **Disabled** → 38% opacity, `pointer-events:none`.

**Change:** add a token-driven utility set in `globals.css` (`@layer components`) and apply
it. No hex literals — all from S1.
```css
/* globals.css — S5-1 interaction states (S1 tokens only) */
@layer components {
  .px-interactive {
    border-radius: 8px;
    transition: background-color .12s ease, color .12s ease;
  }
  .px-interactive:hover { background-color: var(--surface-hover); }    /* #F1F3F4 */
  .px-interactive:active,
  .px-interactive[aria-pressed="true"],
  .px-interactive[aria-current="page"] {
    background-color: var(--primary-surface);                          /* #E8F0FE */
    color: var(--primary);                                            /* #1A73E8 */
  }
  .px-interactive:disabled,
  .px-interactive[aria-disabled="true"] {
    opacity: .38;
    pointer-events: none;
  }
}
```
Swap each ad-hoc `hover:*` button/row/icon-button to `className="... px-interactive"` and
drop the inline `hover:text-[var(--accent-contrast)]`. **The view-switcher strip is removed
by S2-4 (finding #18), so S5-1 does NOT restyle it** — instead S5-1 applies the
`.px-interactive` pressed pill (`aria-current="page"`) to the **sidebar nav rows** S2-4
created (the active-route pill). Disabled Share menu item (`context-actions.ts`
`enabled:false`, rendered L811–818) gets
`aria-disabled` + the 38% rule.

**Accept:** every button / row / icon-button shows all three states; a disabled control
(Share, L811) is at 38% opacity and ignores clicks/keyboard. **Proven by:** visual-regression
surface **#3 file list** (hover + pressed pill visible in the snapshot via a forced
`:hover`/`:active` story state) and **#5 editor toolbar-overflow open** (disabled item);
axe (authed `/files`) stays zero-violation (pointer-events on disabled doesn't strip the
accessible name).

**Steps:**
1. Update/extend visual baseline #3 + #5 to expect the new pill (write the new baseline in
   the same PR — reviewed diff).
2. Add the `@layer components` block to `globals.css` (token refs only).
3. Apply `.px-interactive` across FileManager + layout nav; convert switcher active to
   `aria-current`; add `aria-disabled` to the disabled menu item.
4. Live-verify on a branch deploy: hover a doc row, mouse-down for the pressed pill, tab to
   Share and confirm it's non-interactive at 38%.

---

### S5-2 — Tooltips (every icon-only control)

**Files:** **NEW** `src/components/ui/Tooltip.tsx`; consumers —
`src/components/file-manager/FileManager.tsx` (🏷 L1589, ★/☆ L919, 🗑 L927, ⋯ L1607/L948,
✕ smart-folder L2236 / tag L2316, sort-dir L608), `src/app/(app)/layout.tsx` Help icon
(`HelpMenu`, L82) + sign-out (L83). After S5-4 the emoji become SVG/Material glyphs but the
control set is the same.

**Current → Target:**
- Current: icon-only controls have `aria-label` (good — keep) but **no visible tooltip**.
  e.g. ⋯ button L948 `aria-label={`Actions for ${doc.title}`}`, no hover label.
- Target (audit S5-2): on hover/focus, after **300ms**, show a tooltip — **12px Roboto**,
  bg `--tooltip-bg` (`#3C4043`), white text, 4px radius, ~6px×8px padding. Covers toolbar,
  title bar, sidebar bottom cluster, file-row icon controls.

**Change:** build a tiny presentational `Tooltip` (NEW component — does not exist).
Headless wrapper: renders `children` (the control) + a positioned label; pure CSS delay,
no new state machine, no portal lib.
```tsx
// src/components/ui/Tooltip.tsx — presentational only
export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="px-tip-wrap">
      {children}
      <span role="tooltip" className="px-tip">{label}</span>
    </span>
  )
}
```
```css
/* globals.css — S5-2 (tokens only) */
.px-tip-wrap { position: relative; display: inline-flex; }
.px-tip {
  position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: var(--tooltip-bg); color: #fff; font: 12px/1.4 var(--font-ui);
  padding: 6px 8px; border-radius: 4px; white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity .12s ease .3s; z-index: 1100;        /* 300ms delay */
}
.px-tip-wrap:hover .px-tip,
.px-tip-wrap:focus-within .px-tip { opacity: 1; }
```
The `aria-label` already present stays the accessible name; the visible tooltip text mirrors
it and is `role="tooltip"` (supplementary, not the only label) so axe is unaffected. Wrap
each icon-only control. **Build size: ~0.5 day** (1 small component + CSS + ~10 wrap sites).

**Accept:** hovering OR keyboard-focusing any icon-only control surfaces a labelled tooltip
after 300ms; the control keeps its `aria-label`. **Proven by:** axe (authed `/files`) — every
icon-only control still has an accessible name (tooltip is supplementary); visual surface
**#3 file list** with a forced `:hover` shows the tooltip; manual focus-tab live-verify.

**Steps:**
1. Add a focused unit/RTL test: `Tooltip` renders `children` + a `role="tooltip"` with the
   label (logic is trivial; the real proof is axe + visual).
2. Build `Tooltip.tsx` + the CSS.
3. Wrap the icon-only controls (file-row cluster, sidebar ✕/sort-dir, layout Help/sign-out).
4. Live-verify: hover ⋯, focus-tab to it, confirm 300ms label; re-run authed axe → zero.

---

### S5-3 — Dropdown elevation (OWNER of the shared overlay shell — Decision 6)

**Files:** **NEW/OWNED** the shared dropdown shell (the single overlay every menu
consumes — `src/components/ui/Dropdown.tsx`, or the same file S3-2's menu primitive
imports; **one component, one file**); `src/components/file-manager/FileManager.tsx`
`ContextMenu` (L797–820) + `TagPopover` (L372) re-skinned to the shared surface;
`src/app/globals.css` (the `.px-menu`/`.px-menu-item` elevation shell, consuming the
S1 `--shadow-dropdown` token).

> **S5-3 IS THE OWNER of the shared overlay-elevation CSS (Decision 6, finding
> #16).** It owns the `.px-menu`/`.px-menu-item` shell + the `--shadow-dropdown`
> token wiring. **S2-1 (mega-menu), S3-2 (menu bar), S3-3 (toolbar `⋯`) CONSUME this
> shell — they do not redefine elevation.** Build-order note: S5 runs last, but the
> `--shadow-dropdown` *token* is minted in **S1**, so the `.px-menu` shell class can
> land with the **first consumer** (S3-2) and **S5-3 finalizes/reconciles** it here.
> There is exactly ONE dropdown component across the release — if S3-2's
> `menus/Menu.tsx` and this `ui/Dropdown.tsx` both seem to exist, they are the SAME
> shell (pick one file at execution time; all consumers import it).

**Current → Target:**
- Current: `ContextMenu` = `min-w-44 bg-[var(--paper)] border border-[var(--border)]
  rounded-md shadow-xl py-1` (L799), items `px-3 py-1.5 text-sm` (L811), no fixed row height,
  hover `hover:bg-[var(--accent-contrast)] hover:text-white` (purple, L814). `TagPopover` =
  `rounded-md shadow-lg p-3` (L372).
- Target (audit S5-3): **`box-shadow: var(--shadow-dropdown)`** (the S1 token =
  `0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15)`, dark variant
  included), **8px radius**, white bg (`--surface`), **14px Roboto** items, **36px**
  row height (→ S4-4 `--row-h`), hover bg `--surface-hover` (`#F1F3F4`).

**Change:** wire the elevation via the S1 `--shadow-dropdown` token + a `.px-menu` /
`.px-menu-item` utility; build/own the shared `Dropdown` shell and route
`ContextMenu` + `TagPopover` through it. The hover purple (L814) → `--surface-hover`;
item type → 14px Roboto via `--font-ui`; rows → 36px.
```css
/* globals.css — S5-3 (OWNER of the shared shell; all menus consume this) */
.px-menu {
  background: var(--surface); border-radius: 8px;
  box-shadow: var(--shadow-dropdown);             /* S1 Docs dropdown elevation, dark-aware */
  padding: 6px 0;
}
.px-menu-item {
  display: flex; align-items: center; height: var(--row-h);   /* 36px, S4-4 */
  padding: 0 12px; font: 14px/1 var(--font-ui);
}
.px-menu-item:hover:not([aria-disabled="true"]) { background: var(--surface-hover); }
.px-menu-item[aria-disabled="true"] { opacity: .38; pointer-events: none; }
```
`Dropdown.tsx` is a thin shell (`role="menu"`, `.px-menu`, keyboard arrow handling is
already on `ContextMenu`'s buttons — reuse, don't rebuild). **Build size: ~0.5 day** (1
shell + reskin 2 existing menus). S2/S3 menus adopt the **same** `.px-menu`.

**Accept:** all dropdowns (S2 mega-menu, S3 menus + toolbar dropdowns, file-row ⋯,
`TagPopover`) share the same `--shadow-dropdown` elevation, 8px radius, 36px rows,
`#F1F3F4` hover, 14px Roboto; no purple hover. **Proven by:** visual surface **#5
editor toolbar-overflow open** (a toolbar dropdown) + a file-list snapshot with ⋯
open; axe authed zero.

**Steps:**
1. Update baseline #5 + the file-list ⋯-open snapshot to the new elevation (same PR).
2. Add `.px-menu`/`.px-menu-item` to globals consuming the S1 `--shadow-dropdown`
   token (S5-3 owns this shell; reconcile with the early-landed copy from S3-2).
3. Build/finalize the shared `Dropdown` shell; reskin `ContextMenu` + `TagPopover`.
4. Live-verify: open ⋯ on a row + a toolbar dropdown; confirm identical shadow/radius/rows
   across S2/S3/S5 consumers.

---

### S5-4 — File manager — Drive parity

**Files:** `src/components/file-manager/FileManager.tsx` (view switcher L2087; "+ New folder"
L2120–2126; 📄 at L1222/L1386/L1498/L1580; 📁 at L546; 🏠 L2193; sort toolbar L588; view
toggle L617; tag dot L2306; Smart Folders L2211, Tags L2280; 🏷/★/☆/🗑/⋯ in `DocActions`);
**NEW** `src/components/file-manager/DocGlyph.tsx` + `FolderGlyph.tsx`; **NEW** "+ New" item
wiring into the **S2-1 mega-menu** (S2 owns the menu; S5 supplies "Folder").

**Current → Target:**
- **Tab strip:** Current — in-`FileManager` view-switcher `nav aria-label="views"` (L2087)
  with `rounded-t` tabs + `border-b-2` active underline. Target — **the strip is already
  gone: S2-4 is the sole owner of moving the views into the sidebar nav AND deleting the
  `<nav aria-label="views">` block (finding #18).** S5-4 does **NOT** re-delete it and does
  NOT re-point the view onClicks — that is S2-4's job. S5-4 only does the remaining
  file-row/glyph/sort/dot/Smart-Folders work on the rest of the page, on the assumption the
  strip is already removed.
- **Doc glyph:** Current — `📄 {doc.title}` (L1222/L1386/L1498/L1580). Target — small blue
  Docs-style paper **SVG** (`<DocGlyph/>`), ~20px, fill `--accent` family. Drop the emoji.
- **Folder glyph:** Current — `📁 {node.name}` (L546), 🏠 Root (L2193). Target — Material
  **`folder`** glyph `#5F6368` (→ `--muted`); **starred** folder `#FFD180` (→ `--star`).
  Drop the emoji.
- **Icon emoji:** Current — 🏷 (L1595), ★/☆ (L923), 🗑 (L931), ⋯ (L1616), 🔍 (L2234),
  ✕ (L2257/L2335). Target — drop emoji; ★ uses `--star` `#FFD180`; others → Material Symbols
  (S4-3, 20px). (⋯ visibility handled below.)
- **Sort + view:** Current — `select` "Sort by" (L597) + "↑ Asc / ↓ Desc" button (L612) +
  bordered List/Grid/Details group (L617), `gap-3 mb-3`. Target — a **sort chip** reading
  e.g. "Name ↑" + a **segmented icon-only View toggle** (List/Grid/Details), both
  **right-aligned**; drop any dark default. (Logic unchanged — `doc-sort.ts` already produces
  the order; the chip just labels current `sortKey`+`sortDir`.)
- **Tag dot:** Current — `w-2.5 h-2.5 rounded-full` (10px circle, L2306–2310). Target —
  **6px square** dot **left of the name**, smaller. `style={{ background: tc.bg }}` (already
  token-driven via `resolveTagColor`).
- **+ New folder:** Current — standalone purple button `bg-[var(--accent-contrast)]` (L2120).
  Target — **remove**; "Folder" lives in the S2-1 "+ New" mega-menu. (Wire `handleNewFolder`
  to the mega-menu item; delete the button.)
- **Smart folders / Tags:** Current — `mt-4`, header `text-xs font-semibold uppercase` (L2213
  / L2282). Target — **indent under the tree**, **smaller headers**.

**Change:** purely presentational. Build `DocGlyph`/`FolderGlyph` (NEW, ~20px inline SVG /
Material span, color from S1 tokens). Replace every emoji literal with the glyph component or
a Material Symbol. Re-skin sort toolbar to a chip + segmented toggle (no behavior change —
`onSortKey`/`onSortDir`/`onViewMode` callbacks stay). Shrink tag dot to `w-1.5 h-1.5
rounded-[1px]` (6px square) and move it before the name (it's already before the name at
L2306 — just resize/squaring). Delete the "+ New folder" button (the view-switcher strip is
**already removed by S2-4** — S5-4 does not touch it). Indent Smart Folders/Tags (`pl-2`,
header → smaller uppercase overline styled with `--muted` ink). **Build size: ~1 day**
(2 glyph components + ~12 swap sites + sort/view reskin + the "+ New folder" button delete).
No new feature logic.

**Accept:** the file list reads as Drive — blue paper glyph on docs, grey/amber Material
folder, **no emoji, no purple**; sort chip + right-aligned segmented view toggle; 6px square
tag dot left of names; "+ New folder" gone (Folder is in the mega-menu); Smart Folders/Tags
indented with smaller headers; ⋯ hidden until row hover (per S5-5 below). **Proven by:**
visual surfaces **#2 files page** + **#3 file list** (glyphs, no emoji, sort chip, view
toggle, tag dot); a grep for the emoji literals (`📄 📁 🏠 🔍 🏷 🗑`) over `src/` returns
zero; axe authed `/files` zero.

**Steps:**
1. Update baselines #2 + #3 to the Drive look (same PR).
2. Build `DocGlyph.tsx` + `FolderGlyph.tsx`; unit-test they render an SVG/Material span with
   the right token-driven fill.
3. Swap all emoji → glyphs; resize/square the tag dot; reskin sort→chip + view→segmented;
   delete the "+ New folder" button (the view-switcher strip is already gone via S2-4);
   indent Smart Folders/Tags.
4. Wire "Folder" into the S2-1 mega-menu (calls existing `handleNewFolder`).
5. Live-verify + grep `src/` for the removed emoji → zero.

---

### S5-5 — File-row selection states

**Files:** `src/components/file-manager/FileManager.tsx` — `DocListRow` (L1198–1247),
`AllViewDocRow` (L1552–1629), grid/details renderers (L1358+, L1409+), selection state
(`handleToggle` L1827, `handleSelectAll` L1844, `selected`/`anchorId` L1819–1820). Selection
logic is in `src/lib/docs/selection.ts` (`toggle`, `rangeBetween` — already imported L9).

**Current → Target:**
- Current: selection is **checkbox-only.** The row `<div>` has `onContextMenu` (L1203/L1556)
  but **no row-level `onClick`/`onDoubleClick`**; the checkbox `onClick` captures `shiftKey`
  (L1212/L1565). The doc `<a href={`/d/${id}`}>` (L1218/L1571) opens on a normal click — there
  is **no double-click-to-open / single-click-to-select on the row itself**, and **no
  `⌘`-click multi / shift-click range from the row body** (only from the checkbox).
- Target (audit S5-5): **single click selects** (row bg `--selection-bg` `#D2E3FC`/blue pill) ·
  **double click opens** · **shift-click range** · **⌘/Ctrl-click multi** · **right-click
  context menu** (already works).

**Change — note this is the one S5 item that wires NEW interaction handlers** (the gestures
above don't exist on the row today), but it adds **no new capability**: it routes the same
existing `handleToggle` / `rangeBetween` / `toggle` selection logic and the same
`/d/${id}` open. Add to the row `<div>`:
```tsx
onClick={(e) => {
  if (e.metaKey || e.ctrlKey) { onToggle(doc.id, false, orderedIds); return }  // ⌘ multi
  if (e.shiftKey) { onToggle(doc.id, true, orderedIds); return }               // range
  setOnlySelected(doc.id)                                                       // single
}}
onDoubleClick={() => { router.push(`/d/${doc.id}`) }}                           // open
```
Apply `--selection-bg` bg to the row when `selected` (replacing the doc-link as the open
affordance — keep the `<a>` for keyboard/middle-click, but the primary open is double-click,
matching Drive). `setOnlySelected` = `setSelected(new Set([id]))` + `setAnchorId(id)` (new
helper next to `handleToggle`). The checkbox stays (a11y + bulk select). `onContextMenu`
unchanged. **Build size: ~0.5 day**, gated by Playwright gesture tests (logic is pure +
testable in `selection.ts`).

**Accept:** single-click sets exactly one selected row (`#D2E3FC` bg) · double-click opens
the doc · shift-click extends the range · ⌘/Ctrl-click toggles into the set · right-click
opens the context menu; existing bulk-action bar (E6) and checkbox select-all keep working.
**Proven by:** Playwright drives single / double / shift / ⌘ / right-click and asserts each
result (selection set size, navigation, menu open); visual surface **#3 file list** shows the
blue selection bg; axe authed zero (row stays keyboard-reachable via the `<a>` + checkbox).

**Steps:**
1. TDD the pure layer first: `selection.ts` already has `toggle`/`rangeBetween` — add unit
   tests for the `setOnlySelected` (single-select) reducer if not covered.
2. Add Playwright e2e: each of the 5 gestures → asserted outcome (RED first — row has no
   `onClick` today).
3. Wire `onClick`/`onDoubleClick` + `--selection-bg` bg on `DocListRow`, `AllViewDocRow`, and
   the grid/details rows; keep checkbox + `onContextMenu`.
4. Live-verify all five gestures on a branch deploy; confirm bulk bar + select-all intact.

---

### S5-6 — Landing redirect

**Files:** `src/app/page.tsx` (entire file — currently the centered Open files / Health
card). No middleware exists; `requireUser` already gates `/files` → `/login` (app layout
L27), so a server redirect is enough and won't loop.

**Current → Target:**
- Current: `page.tsx` renders `<main class="... max-w-2xl ... justify-center ...">` with h1
  "Parchment", tagline `<p>`, version `<span>`, and a `<nav>` with **"Open files"**
  (`/files`) + **"Health"** (`/api/health`). 35 lines.
- Target (audit S5-6): `/` → **redirect to `/files`**. Drop the centered card **entirely**.
  Health stays reachable via **Settings → Admin → Health** (`/settings/admin/health` already
  exists per the authed axe route list).

**Change:** replace the whole component with a server redirect.
```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/files') }
```
`/files` is in the `(app)` group whose layout calls `requireUser()`; an **unauthed** visitor
hitting `/` → `/files` → `requireUser` → `/login` (no loop, single hop). An **authed**
visitor lands on `/files`. The `/api/health` link is removed (Health lives in Settings →
Admin → Health; no link is left dangling on a deleted page).

**Accept:** GET `/` returns a redirect to `/files`; the centered card is gone; unauthed `/`
ends at `/login`, authed `/` ends at `/files` — neither loops. **Proven by:** visual surface
**#1 landing redirect** (the snapshot of `/` is now the `/files` page, not the card); a
Playwright assertion that `/` 3xx → `/files` for authed and → `/login` for unauthed.

**Steps:**
1. Update baseline #1: `/` now snapshots as `/files` (same PR).
2. Add Playwright: authed `/` → `/files`; unauthed `/` → `/login` (no redirect loop).
3. Replace `page.tsx` with the redirect.
4. Live-verify both auth states on a branch deploy.

---

### S5-7 — Files page hero

**Files:** `src/app/(app)/files/page.tsx` (h1 L35, subtitle = none here; the tagline lives on
the landing — see S5-8).

**Current → Target:**
- Current: `<h1 class="font-semibold text-2xl tracking-tight">Files</h1>` (L35) +
  "+ New document" button (L37). No subtitle on this page (the only subtitle/tagline is on
  the landing, removed in S5-8).
- Target (audit S5-7): H1 → **"My Drive"** (preferred) **or "My Files"**, **22px Google Sans
  regular** (→ S4-2 title ramp class, `font-weight: 400`, color `--foreground`); drop any
  subtitle.

**Change:** retitle + retype the h1 (token-driven).
```tsx
<h1 className="px-title">My Drive</h1>   {/* .px-title → 22px Google Sans 400, color var(--foreground) */}
```
`.px-title` (or the S4 type-ramp class) is already defined by S4-2; S5-7 only applies it +
changes the string. The "+ New document" button text is handled in S5-8 (folds into the New
mega-menu as "Blank document").

**Accept:** the files hero reads **"My Drive"** at **22px Google Sans 400**; no subtitle.
**Proven by:** visual surface **#2 files page** (new title, correct size/weight); axe authed
zero (single h1 preserved).

**Steps:**
1. Update baseline #2 (same PR).
2. Apply the S4-2 title class + change the string to "My Drive".
3. Live-verify the rendered size/weight against the audit (22px / 400).

---

### S5-8 — Copy revisions

**Files:** `src/app/(app)/files/page.tsx` ("+ New document" L41); `src/app/page.tsx`
(tagline L11–13 + version L14 — *removed wholesale by S5-6's redirect, but the **strings**
must also not reappear anywhere else*); `src/components/file-manager/FileManager.tsx`
("+ New folder" L2125 → mega-menu "Folder", handled in S5-4); the S2-1 mega-menu items
(labels "Blank document" / "Folder"); Help → About surface (version string moves here).

**Current → Target:**
- "+ New document" (files page L41) → **"Blank document"** in the New mega-menu (S2-1).
- "+ New folder" (FileManager L2125) → **"Folder"** in the mega-menu (S5-4 deletes the
  button; S5-8 sets the label).
- `"v0.1.0 — single-user preview"` (landing L14) → **dropped from the landing**; version
  appears **only** in Help → About.
- `"Markdown-first writing, page-bounded canvas, real-time collab. Self-hosted."`
  (landing L12–13) → **dropped from in-app surfaces.**

**Change:** copy-only. The landing strings vanish with the S5-6 redirect (the card is
deleted), but S5-8's job is to **prove they don't survive elsewhere** and to set the
mega-menu labels. Add/confirm the version string lives in Help → About (the `HelpMenu`
component, layout L82). No new logic.

**Accept:** "Blank document" / "Folder" are the New-menu labels; the tagline and
`v0.1.0 — single-user preview` strings are **gone from every rendered surface** and the
version appears only in Help → About. **Proven by:** `grep -r` over `src/` for
`"single-user preview"`, `"Markdown-first writing"`, `"+ New document"`, `"+ New folder"`
returns **zero** (or only the Help→About version); live screenshots of landing-redirect /
editor / files confirm; visual surfaces **#1 + #2**.

**Steps:**
1. grep `src/` for each removed/relabelled string → record the RED hits.
2. Apply the mega-menu labels (S2-1 items) + ensure version is in Help → About.
3. Re-grep → zero stale hits (except Help→About version); live screenshot confirm.

---

### S5-9 — Save-status COPY (title bar; STATE owned by S3-1)

**Files:** the **S3-1 doc title bar** save-status slot. **S5-9 supplies the COPY
STRINGS ONLY** (Decision 4) — the in-flight→settled→idle **state machine is built
and owned by S3-1** (the original "wire to the save lifecycle the editor already
exposes" claim was FALSE: `save` is a fire-and-forget `void fetch` with no
isSaving/saved/lastSaved state — so the state had to be created somewhere, and
Decision 4 assigns it to S3-1).

**Current → Target:**
- Current: no doc title bar exists yet; **S3-1 builds the slot AND the
  in-flight→settled→idle state** (Decision 4). S5-9 has no state to build.
- Target (audit S5-9): the three copy strings for S3-1's three states —
  **"Saving…"** (in-flight) → **"All changes saved to disk"** (settled) →
  (after S3-1's **5-min idle** timer) **"Last edit was N minutes ago"**.

**Change:** **copy only.** Map S3-1's three state values to the three strings; the
"to disk" wording reflects Parchment's disk-mirror model. **No save path, no state
machine, no timer is built here** — those are S3-1's. S5-9 is genuinely microcopy
that consumes S3-1's state. **Hard-blocked on S3-1** (its state must exist first);
if S3-1 is PARTIAL, S5-9 is PARTIAL — log, don't fake.

**Accept:** the title bar shows "Saving…" during a save, "All changes saved to disk"
once settled, and "Last edit was N minutes ago" after 5 minutes idle — **driven by
S3-1's state**, with S5-9's strings. **Proven by:** Playwright drives an edit →
asserts the three strings at the right moments (advancing S3-1's idle timer); visual
surface **#4 editor idle** shows the settled string.

**Steps:**
1. Confirm S3-1's title bar + **save-status state** exist (Decision-4 dependency gate).
2. Supply the three strings (incl. the "N minutes ago" template) to S3-1's slot —
   copy only, no new state.
3. Playwright: edit → "Saving…" → "All changes saved to disk"; advance S3-1's 5-min
   timer → "N minutes ago".
4. Live-verify on the editor route.

---

### S5-10 — Editing-mode dropdown (toolbar right end, S3-3)

**Files:** the **S3-3 editor toolbar** (NEW/restyled in S3); the **D2 suggesting mode**
(existing track-changes marks) + a read-only view path. S5-10 places the dropdown + wires
the three modes to **existing** behavior.

**Current → Target:**
- Current: no Editing/Suggesting/Viewing affordance in the toolbar; suggesting exists as the
  D2 track-changes plugin; no surfaced read-only "Viewing" toggle.
- Target (audit S5-10): a right-end toolbar **dropdown** — **Editing / Suggesting / Viewing**
  — matching Google Docs. Suggesting routes edits through the existing D2 track-changes;
  Viewing is read-only.

**Change:** add the dropdown (using the shared S5-3 `Dropdown`) bound to the editor's mode
state: Editing = normal, Suggesting = enable the existing D2 suggesting plugin, Viewing =
set the editor `editable=false`. **No new editing logic** — it switches between existing
modes. **Risk (the G13 lesson):** programmatic/IME edits in Suggesting must go through the D2
marks, not a silent commit — the dropdown only flips the plugin flag the D2 path already
honors. Depends on S3-3 (toolbar) being present.

**Accept:** the dropdown switches modes; an edit made in **Suggesting** renders as a tracked
change (D2 mark), not a silent commit; **Viewing** is read-only (typing does nothing).
**Proven by:** Playwright — select Suggesting, type, assert the edit is a tracked change;
select Viewing, type, assert no doc mutation; visual surface **#5 editor toolbar-overflow
open** shows the dropdown.

**Steps:**
1. Confirm S3-3 toolbar exists (dependency gate); reuse S5-3 `Dropdown`.
2. Wire the three modes to existing state (D2 suggesting flag + `editable`).
3. Playwright: Suggesting edit → tracked change; Viewing edit → no-op.
4. Live-verify the mode switch on the editor.

---

### S5-11 — Modal dialog shell → Docs (the shared `.parchment-dialog`)

**Files:** `src/app/globals.css` `.parchment-dialog*` (the shared shell at **L844+**:
`.parchment-dialog` L854, `-header` L866, `-title` L872, `-close` L879, `-tabs` L895);
the 10+ dialogs that consume it: **ShareDialog** (the VR baseline #6 surface),
ImageDialog, PageSetupDialog, CropDialog, DrawingModal, CustomCssDialog,
GithubEmbedDialog, EmbedDialog, DrawioModal, SectionBreakDialog, LinkPopover.

**Why this is a NEW item (closes findings #5 + #6).** The shared modal shell is
never restyled to Docs elevation: `.parchment-dialog` (globals.css L854) has
`box-shadow: 0 8px 32px rgb(0 0 0/0.2)`, `border-radius: 8px`, title `1.1rem/600` —
none of which is the Google Material dialog look. **No item owns it**, yet the
**share dialog is a committed VR baseline (#6)** and a per-PR live-deploy artifact,
and S1-1's accept even cites surface #6 as proof. Restyling this ONE shell upgrades
ShareDialog + all 10+ dialogs at once — this is what makes VR surface #6 actually
owned (S1 only swept its error-color; nothing addressed layout/header/type/elevation).

**Current → Target:**
| Aspect | Current | Target (Docs Material dialog) |
|---|---|---|
| Elevation | `box-shadow: 0 8px 32px rgb(0 0 0/0.2)` (inline literal) | `box-shadow: var(--shadow-dialog)` (S1 token, dark-aware) |
| Radius | `border-radius: 8px` | 8px (keep) — Docs corners + 24px content padding |
| Header | title `1.1rem/600`, ad-hoc | **Google Sans 16–20px**, header padding on the 24px grid, close = 32px icon button |
| Type | mixed | 14px Roboto body, `--foreground`/`--muted` ink |
| Surface | `--paper` | `var(--surface)` white; overlay scrim from a token |
| Primary button | `--accent-contrast` | `var(--primary)` + `var(--on-primary)` (fixed brand) |

**Change:** restyle the shared `.parchment-dialog*` shell to the Material dialog —
swap the inline shadow literal for `var(--shadow-dialog)`, retune header type to
Google Sans, normalize content padding to the 24px grid, point the primary action
at `--primary`/`--on-primary`. **All 10+ dialogs inherit it** because they share the
shell — no per-dialog rewrite. ShareDialog gets a quick layout pass (field spacing,
button shape) on top so VR surface #6 reads as a real Docs dialog. **No new logic.**

**Accept:** every modal (Share / Image / Page setup / Crop / Drawing / Custom CSS /
GitHub embed / Embed / draw.io / Section break / Link) renders with
`var(--shadow-dialog)` elevation, Google-Sans header, 24px content grid, blue
primary button. **Proves it:** VR surface **#6 share dialog open** (now genuinely
owned) + a live-deploy screenshot of one other dialog (e.g. Page setup); axe on the
open dialog (focus trap, labelled close, `role="dialog"`).

**Steps:**
1. RED: VR #6 share dialog showing the pre-Docs shadow/header.
2. Restyle `.parchment-dialog*`: `var(--shadow-dialog)`, Google-Sans header, 24px
   grid, `--primary` primary button, `--surface` bg.
3. ShareDialog layout pass (field spacing/button shape).
4. Live-verify Share + one other dialog; axe focus-trap/labels.
5. Update VR #6 baseline + the dialog live-deploy screenshot.

---

### S5-12 — Floating editor surfaces → Docs popover elevation

**Files:** `src/components/editor/BubbleMenu.tsx` (`.parchment-bubble-menu`,
globals.css **L572**: `border-radius: 6px`, `box-shadow: 0 2px 8px rgb(0 0 0/0.12)`),
the SlashMenu surface, and LinkPopover; `src/app/globals.css` (their rules).

**Why this is a NEW item (closes finding #11).** The inline editor floating surfaces
(selection BubbleMenu, slash-insert menu, link popover) keep the pre-Docs 6px
radius + `0 2px 8px` shadow and today use the purple accent on `aria-pressed`
buttons. S5-3 only reskins ContextMenu + TagPopover — it does NOT touch these. Left
alone they recolor via S1 tokens but keep the 6px/non-Docs elevation while every
other menu moves to 8px + `--shadow-dropdown`, a visible inconsistency.

**Current → Target:** BubbleMenu / SlashMenu / LinkPopover → **Docs popover
elevation** — `box-shadow: var(--shadow-dropdown)`, **8px radius**, white
(`var(--surface)`), `aria-pressed` buttons use `--primary-surface`/`--primary` (not
purple). Consume the **S5-3 `.px-menu` shell** where the markup allows (these are
floating panels, so they at minimum adopt the radius/shadow/hover tokens).

**Change:** swap the 6px radius → 8px, the inline `0 2px 8px` shadow →
`var(--shadow-dropdown)`, and the purple pressed state → `--primary-surface`/
`--primary`, on the three floating surfaces. **No new logic** — pure restyle to the
canonical popover tokens.

**Accept:** the bubble menu, slash menu, and link popover share the **same** 8px /
`--shadow-dropdown` / white / blue-pressed look as every other dropdown; no purple,
no 6px outlier. **Proves it:** a live-deploy screenshot of the bubble menu (select
text) + the slash menu (type `/`) + the link popover; axe on each.

**Steps:**
1. RED: screenshot the bubble/slash/link surfaces showing 6px + `0 2px 8px` + purple.
2. Swap radius→8px, shadow→`var(--shadow-dropdown)`, pressed→`--primary-surface`.
3. Live-verify all three match the dropdown elevation; axe.

---

### S5-13 — Secondary surfaces parity (drawers + public share viewer + login)

**Files:**
- `src/components/editor/CommentsSidebar.tsx` (516 lines) — comments drawer (README
  "comments drawer open" artifact surface).
- `src/components/editor/VersionHistory.tsx` (778 lines) — version-history drawer
  (README artifact surface).
- `src/components/share/ShareViewer.tsx` (164 lines) + `src/components/share/render-pm.tsx`
  — the public `/share/[token]` read-only viewer (password gate + "view-only in v0.1").
- `src/app/(auth)/login/login-form.tsx` (188 lines) + `login/page.tsx` — the `/login`
  page (the unauthed entry point per S5-6's redirect).

**Why this is a NEW item (closes findings #7 + #8 + #9).** S1 only **token-swaps**
the two drawers (resolving the `--surface*` fallbacks) — no item redesigns them to
Google-Docs comment-card / revision-list shape, header, or spacing, yet the README
requires live-deploy screenshots of both as "restyled surfaces." The **public share
viewer** (`/share/[token]`) — the entire external-facing surface a recipient lands
on — is owned by **no** plan (grep over the plans returns zero). The **`/login`
page** — which S5-6's `/`→`/files`→`requireUser`→`/login` redirect makes the public
entry point — is restyled by no item. S5-13 owns the **layout/type parity** for all
four (S1 token-swept them; this gives them real Docs framing, not just a color swap).

**Current → Target:**
| Surface | Current | Target |
|---|---|---|
| CommentsSidebar | drawer, ad-hoc card/header spacing | Docs comment-card shape, 14px Roboto, `--surface`/`--surface-muted`, `--border` divider |
| VersionHistory | drawer, ad-hoc revision list | Docs revision-list rows (36px), grouped by date, `--surface` |
| ShareViewer `/share/[token]` | unstyled-ish read-only view + password gate | Docs framing: white page on `--editor-gutter`, `.parchment-prose` ramp (S4-2), a slim header; the password gate uses the S5-11 dialog/field type |
| `/login` | ad-hoc auth card | Docs sign-in card: `--surface`, Google-Sans heading, `--primary` submit button, `--border` inputs |

**Change:** apply the canonical tokens + S4 type ramp + S5-1 interaction states to
each surface's real layout (card/row/header spacing), not just a color swap. The
share viewer's prose adopts S4-2 `.parchment-prose`; its password gate adopts the
S5-11 dialog field type. **No new feature logic** — read-only viewer, drawers, and
login all keep their existing behavior; this is layout/type parity. **Realistic
size: ~1–1.5 days** across four surfaces — if the two large drawers (516 + 778 LOC)
outgrow one PR, ship the share-viewer + login parity first and mark the drawer
redesign **PARTIAL** with the percent; do not silently drop them.

**Accept:** comments drawer, version-history drawer, `/share/[token]`, and `/login`
all read as Google-Docs surfaces (tokens + type + interaction states + real layout).
**Proves it:** live-deploy screenshots of all four (the comments + version-history
drawers satisfy the README artifact list); a public unauthenticated `/share/<token>`
screenshot; axe on `/login` and the share viewer (public axe spec already exists).

**Steps:**
1. RED: screenshots of the four surfaces in their current state.
2. CommentsSidebar + VersionHistory layout/type pass (or PARTIAL with percent).
3. ShareViewer Docs framing + `.parchment-prose` + password-gate type; `/login`
   sign-in card.
4. Live-verify all four (public share viewer unauthenticated); axe public + authed.

---

## Coverage check

- **Audit gaps closed:** flat / no interaction feedback → **S5-1/2/3**; non-Drive file
  manager (emoji, purple, dark sort/view, 10px circle tag dot) → **S5-4/5**;
  landing card + stale copy → **S5-6/7/8**; save-status COPY + mode affordances →
  **S5-9/10**; **uncovered surfaces (findings #5–#11): dialog shell → S5-11, floating
  editor surfaces → S5-12, drawers + public share viewer + login → S5-13.**
- **Cross-plan wiring (canonical tokens — findings #4/#12/#14/#15/#22):** S5-1/3
  colors are the canonical S1 tokens (`--surface-hover`, `--primary`,
  `--primary-surface`, `--selection-bg`, `--shadow-dropdown`), never literals, **no
  "reconcile at execution time" hedge** (S1 decided every name); pills/icons sized
  by S4-3/S4-4 (`--row-h` 36px, 32px icon button, 20px Material over **S1-8 faces**).
  **The view-switcher strip is removed solely by S2-4 (finding #18) — S5-4 does NOT
  touch it.** The "+ New" mega-menu lives in **S2-1**; S5-4/S5-8 supply its "Blank
  document" / "Folder" labels and delete the standalone purple "+ New folder" button
  (FileManager L2120). **S5-9 supplies COPY only; the save-status STATE is owned by
  S3-1 (Decision 4).** S5-10 is placed by **S3-3** and drives the existing **D2**
  suggesting marks + a read-only view (no new editing logic). **S5-3 OWNS the shared
  overlay shell (`.px-menu` + `--shadow-dropdown`); S2-1/S3-2/S3-3 CONSUME it
  (Decision 6) — one dropdown, built once, owned by S5-3.**
- **Out of scope:** no new file-manager capability — views / tags / smart folders /
  selection / context menu / import / trash already exist (E-plan); S5 only restyles their
  look/feel **plus** the S5-5 row-gesture wiring, which routes the *existing*
  `selection.ts` logic and the *existing* `/d/${id}` open — no new behavior.
- **Token discipline:** every var name S5 references is in the **canonical
  vocabulary** (plan-S1.md) — `--surface-hover`, `--primary`, `--primary-surface`,
  `--selection-bg`, `--shadow-dropdown`, `--shadow-dialog`, `--star`, `--tooltip-bg`,
  `--font-ui`, `--row-h`, `--foreground`/`--muted`. The retired names (`--hover`,
  `--accent-pill`, `--accent-hover`, `--selection`, `--shadow-menu`, `--icon-muted`,
  `--text-title`) do **not** appear in any S5 rule. Grep S5 for a var not in the
  canonical table → empty.

## Failure-modes-verified

- **Selection-gesture regressions** (E6 bulk-select + checkbox select-all + E7 context menu
  must keep working; S5-5 *adds* row-level click handlers that don't exist today) →
  Playwright drives single / double / shift / ⌘ / right-click **and** the existing checkbox
  + select-all + bulk bar; asserts each outcome; no broken bulk-ops.
- **Landing redirect loop / auth** (`/` → `/files` must reach `/login` when unauthed, not
  loop — `requireUser` in the `(app)` layout is the only gate; no middleware) → unauthed `/`
  → `/login` and authed `/` → `/files` both asserted on the deploy.
- **Tooltip a11y** (icon-only controls already carry `aria-label`; the S5-2 tooltip must stay
  *supplementary* `role="tooltip"`, not become the only name) → axe authed `/files` asserts
  every icon-only control still has an accessible name.
- **Copy-removal completeness** (a stale tagline / version string left on one surface) →
  `grep -r` over `src/` for `"single-user preview"`, `"Markdown-first writing"`,
  `"+ New document"`, `"+ New folder"` returns zero (version only in Help → About); live
  screenshots of landing-redirect + editor + files confirm.
- **Mode dropdown vs suggesting plugin** (the G13 lesson — programmatic edits not tracked) →
  Suggesting routes through the existing D2 marks; a Suggesting-mode edit is asserted to
  render as a tracked change, Viewing as a no-op — not a silent commit.
- **Emoji/glyph swap completeness** (a row losing its icon, or an emoji surviving) →
  file-list snapshot (#3) shows every doc/folder row with the new `DocGlyph`/`FolderGlyph` /
  Material glyph; a grep for `📄 📁 🏠 🔍 🏷 🗑 ★ ☆ ✕ ↑` over `src/` returns zero.
- **New shared components don't exist yet** (`Tooltip`, `Dropdown`, `DocGlyph`,
  `FolderGlyph`) → each built fresh as a presentational shell (no new behavior), unit-tested
  for render output, and gated by axe + visual snapshots.

## Newly-discovered gaps / PARTIAL risks

1. **Visual-regression harness is net-new (release-level).** `tests/e2e/` has only axe specs
   (`a11y.public.spec.ts`, `a11y.authed.spec.ts`) — **zero** `toHaveScreenshot`. The
   7-surface baseline harness the README/scope rely on **does not exist**. It is a
   prerequisite for *every* S-plan, nominally stood up in S1; if it is still missing when S5
   runs, **the first S5 PR must create `tests/e2e/visual.spec.ts` + committed snapshots**
   (~1 PR, +0.5 day).
2. **S5-5 is the one item that adds interaction handlers, not just CSS.** Row-level
   single-click-select / double-click-open / ⌘-click / shift-click from the row body **do
   not exist** today (selection is checkbox-only; `onClick` lives on the checkbox at L1212/
   L1565). It routes existing `selection.ts` logic + the existing open — no new capability —
   but it touches four row renderers (`DocListRow`, `AllViewDocRow`, grid, details) and must
   not regress the checkbox/bulk path. Scope it carefully; gate hard with the gesture e2e.
3. **S5-9 and S5-10 are hard-blocked on S3.** Both depend on S3-1 (title bar +
   **save-status STATE**, Decision 4) / S3-3 (toolbar) existing. **S5-9 is COPY only**
   (it consumes S3-1's state — the original "wire to the save lifecycle" claim was
   false; `save` is a fire-and-forget `void fetch` with no state). If S3-1/S3-3 ship
   **PARTIAL**, S5-9/S5-10 are **PARTIAL** too — log the blocked sub-part, do not
   claim DONE. (Carries the README PARTIAL rule.)
4. **No PARTIAL risk inside S5-4 itself** — unlike S3-2's menu system, S5-4 is bounded
   restyle (2 glyph components + emoji swaps + sort/view reskin). It is one PR. The mega-menu
   it folds into (S2-1) is the larger build, owned by S2. **S5-13 IS a PARTIAL risk**
   (the two large drawers, 516 + 778 LOC, may outgrow one PR — ship share-viewer +
   login parity first, mark the drawer redesign PARTIAL).
5. **Three+ new shared UI primitives** (`Tooltip`, the shared `Dropdown` shell,
   `DocGlyph`/`FolderGlyph`) are created in S5. They are presentational only, but they
   are *new files* — flag for review that S5 is not pure CSS.
6. **Three new surface items (S5-11/12/13)** close the seven uncovered-surface
   findings (#5–#11): the shared dialog shell (S5-11, makes VR #6 truly owned), the
   floating editor surfaces (S5-12), and the comments/version drawers + public share
   viewer + login (S5-13). S5-3 is now the explicit OWNER of the shared dropdown
   shell (finding #16, Decision 6).

---

## Adversarial-review fix pass (branch `feat/S5-polish`)

Two BLOCKING findings from adversarial review were fixed. No DB schema touched
(both fixes are CSS + JSX `className` only — no migration needed).

### Finding 1 [important] — disabled context-menu item lacked 38% opacity + pointer-events:none
- **File:** `src/app/globals.css`. The shared
  `.px-menu-item:disabled, .px-menu-item[aria-disabled="true"]` rule (was L567–571)
  only set `color: var(--muted)` + `cursor: default`. The disabled Share row
  (`context-actions.ts` `enabled:false` → rendered with `aria-disabled="true"` and
  `className="px-menu-item px-menu-action"` at FileManager.tsx L844, **not**
  `.px-interactive`) therefore got no dim and stayed pointer-/keyboard-live visually.
- **Fix:** added `opacity: 0.38; pointer-events: none;` to that shared rule —
  exactly the S5-3 CSS spec (`.px-menu-item[aria-disabled="true"] { opacity: .38;
  pointer-events: none; }`). The Share row now renders at 38% opacity and ignores
  clicks/keyboard. `:hover` is already excluded via
  `:not(:disabled):not([aria-disabled="true"])`, and the accessible name (the
  `aria-disabled` button text) is preserved, so authed `/files` axe is unaffected.

### Finding 2 [important] — row action controls never hidden until row hover (no Drive parity)
- **File:** `src/components/file-manager/FileManager.tsx`. The S5-4 accept criteria
  require "⋯ hidden until row hover". No hover-reveal existed (`group-hover`,
  `opacity-0`, `group/row`, `invisible` all returned zero).
- **Fix:** implemented the Drive-parity hover-reveal with Tailwind v4 named groups:
  - The `DocActions` cluster root `<div>` and the `AllViewDocRow` inline action
    cluster (tag + ⋯) now carry
    `opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100`.
  - The three row containers that host those clusters were marked `group/row`:
    `DocListRow`'s row `<div>` (L1275), the details-view `<tr>` (L1601), and the
    `AllViewDocRow` root `<div>` (L1689).
  - `group-focus-within/row:opacity-100` keeps the controls fully keyboard-reachable
    (Tab into the row reveals them), so the controls are revealed on hover OR focus —
    never permanently hidden from keyboard/AT, preserving the a11y boundary.

### Gate (all green)
- `pnpm biome check src` → 0 errors / 0 warnings (exit 0; only the npm engine WARN).
- `tsc --noEmit` → 0 errors (exit 0).
- `vitest run --exclude '**/integration/**'` → 114 files / 1245 tests passed (exit 0).
- `pnpm build` → ✓ Compiled successfully; 34/34 static pages generated (exit 0).
