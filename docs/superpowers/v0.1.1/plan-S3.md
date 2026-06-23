# Plan S3 — Editor chrome (title bar, menu bar, toolbar, outline, status bar)

> 🟢 **GO — executing.** S1→S5 in progress; user gave GO 2026-06-23.
> (title bar S3-1, menu bar S3-2) + a full toolbar restyle (S3-3) and re-homes the
> outline (S3-5) and status bar (S3-6). **S3-2 is the confirmed PARTIAL risk:** the
> File/Edit/View/Insert/Format/Tools/Extensions/Help dropdown system needs a NEW
> shared menu component that does not exist anywhere in the codebase today (the map
> confirms "Menu bar: DOES NOT EXIST"). It cannot land 100% in one item — ship the
> menus that wrap existing actions, mark S3-2 `PARTIAL (n%)` with the
> shipped-vs-placeholder list, never `DONE`. **No new feature logic in this plan —
> every menu/toolbar entry only re-surfaces a handler that already exists on
> `Editor.tsx` / `Toolbar.tsx`.** All colors come from S1 tokens — no hardcoded hex.

**Intent:** make the editor route read as Google Docs — a pinned title bar, a menu
bar, one light toolbar row, a light outline left-rail, and a slim white status bar
— by restyling and re-homing the chrome that already exists, plus building the two
genuinely-missing surfaces (title bar, menu bar) as pure shells over existing
handlers.

**Files in play (verified against the live map):**
- `src/components/editor/Editor.tsx` — chrome container. The `return (…)` (lines
  **1388–1694**) renders, in order: `<Toolbar>` (1391–1422), the plain title
  `<h1>` (**1424**), the outline+canvas flex row (1437–1500), `<OfflineIndicator>`
  (1506), `<StatusBar>` (1508–1513). All panel toggle state + handlers already live
  here (`shareDialogOpen`, `commentsSidebarOpen`, `versionHistoryOpen`,
  `setPageSetupOpen`, `openFind`, `onExportPdf`, etc.).
- `src/app/(app)/d/[id]/page.tsx` — server component; passes `initialTitle`
  (line 47) + all flags to `<Editor>`. No chrome here.
- `src/components/editor/Toolbar.tsx` — the 50+-control formatting row; render
  root `.parchment-toolbar` at **line 265**; export `<fieldset>` at **906–940+**;
  panel-toggle buttons (comments 776, history 788, share 852, reading 865,
  presenter 877, source 889) all already wired via props.
- `src/components/editor/OutlinePane.tsx` — left rail (`<aside.parchment-outline>`,
  render at lines **136–212**). Header text "Outline" at **154–156**.
- `src/components/editor/StatusBar.tsx` — full file (47 lines); root
  `.parchment-status-bar` at **19**.
- `src/app/globals.css` — all chrome styling. Key blocks: `.parchment-status-bar`
  **437–444**, `.parchment-toolbar*` **463–568**, `.parchment-outline*`
  **1182–1349**.
- **NEW** `src/components/editor/DocTitleBar.tsx` (S3-1).
- **NEW** `src/components/editor/MenuBar.tsx` + `src/components/editor/menus/*`
  config (S3-2).
- **NEW** `src/components/editor/menus/MenuButton.tsx` (or shared `Menu`/`MenuItem`
  dropdown primitive — the shared component S3-2's PARTIAL risk hinges on).
- New CSS appended to `globals.css` (or a co-located module) keyed by the new
  class names below.

**Token contract (canonical vocabulary from plan-S1.md — never hardcode after S1):**
`--primary` (`#1A73E8`), `--primary-hover` (`#1765CC`), `--primary-pressed`
(`#185ABC`), `--primary-surface` (`#E8F0FE`, active pill), `--on-primary`
(`#FFFFFF`, text on a primary fill), `--surface` (white), `--surface-muted`
(`#F8F9FA`), `--surface-hover` (`#F1F3F4`, hover pill), `--border-chrome`
(`#E8EAED`, the editor chrome row borders), `--foreground`/`--muted` for text. The
audit specs below quote literal hex for traceability; the **implementation uses the
S1 var**.

> **Border resolution (closes the cross-plan `#E8EAED` vs `#DADCE0` minor):** the
> editor chrome rows (title/menu/toolbar/status borders) are **`#E8EAED`** and S1
> mints that as a **dedicated token `--border-chrome`** — distinct from the
> structural/sidebar `--border` (`#DADCE0`). Both are real Google values; both are
> named. **S3 references `var(--border-chrome)` for every chrome-row border.** It
> does NOT use `var(--border)` for these, and it does NOT introduce a literal.
> S3 also uses `--primary-surface` (the active pill, finding #2/the `--primary-surface`
> blocker — minted by S1, no literal here).

---

### S3-1 — Doc title bar (NEW component)

**Files:** create `src/components/editor/DocTitleBar.tsx`; mount it in
`Editor.tsx` as the **first child** of the outer `<div className="mx-auto
max-w-5xl">` (insert above the `<Toolbar>` at line 1391). New CSS block
`.parchment-titlebar*` in `globals.css`.

**Current → Target:**
- Current: there is **no title bar**. The title is a plain
  `<h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>`
  at `Editor.tsx:1424`, rendered *below* the toolbar, not pinned, not interactive
  (read-only — `initialTitle` is never editable in the editor today).
- Target: a pinned top row, **56px** tall, `background:#FFFFFF` (`var(--surface)`),
  `border-bottom:1px solid #E8EAED` (`var(--border-chrome)`). Left→right children:
  1. 24px doc glyph (links to `/files`),
  2. inline-editable title (18px Google Sans — S4-1 — click-to-edit, autosave on
     blur, truncate + `title` tooltip),
  3. star toggle (`☆`→`★`, active = `var(--primary)`),
  4. move-to-folder icon,
  5. save-status text — slot driven by S3-1's NEW save-status state (Decision 4),
     copy strings from S5-9 ("Saving…" / "All changes saved to disk" / idle label),
  6. flex spacer,
  7. comments icon (+ optional count badge),
  8. history clock,
  9. **Share** button — rounded pill, `background:var(--primary)`, white text,
     16px people glyph, 36px tall,
  10. avatar cluster (reuses S2-5's account-menu avatar).

**Change:** new component is a **near-pure shell** — every icon maps 1:1 to an
existing `Editor.tsx` handler. The two genuinely-new bits are (a) the inline-title
save and (b) a **small save-status state wrapper** (Decision 4) — both honestly
flagged below as small NEW logic, not "microcopy" or "pure shell".

- **Title editing → use the EXISTING title-only endpoint
  `POST /api/docs/[id]/rename` (DECISION 3).** This route exists today
  (`src/app/api/docs/[id]/rename/route.ts`, backed by `renameDocument`, used by
  `FileManager.tsx:~687`) and writes **only the title** — it never touches
  `contentJson`/`markdown`. The blur handler issues `POST
  /api/docs/${docId}/rename` with `{ title }`.
  **Do NOT** reuse the body-save callback (`Editor.tsx:797`, a `PUT /api/docs/:id`
  that sends `{ contentJson, markdown }`): the PUT handler
  (`api/docs/[id]/route.ts:26–30`) does `contentJson: body.contentJson ?? {}` /
  `markdown: String(body.markdown ?? '')`, so a title-only PUT would write an empty
  body — **the I4 clobber.** There is also no `PATCH` handler on that route (only
  GET + PUT). The rename endpoint is the body-safe mechanism and it already exists,
  so this adds **no new backend work** (corrects the original "PATCH /api/docs/:id"
  / "reuse the body-PUT pattern" mistake that would 404 or destroy content).
- star / move-to-folder → wire to the existing files-side actions if present;
  if no backing endpoint exists, render them **visibly disabled / "coming soon"**
  and log them in the PARTIAL note — do NOT ship a dead control.
- **save-status slot → S3-1 builds a minimal in-flight→settled→idle state wrapper
  (DECISION 4).** Today `save` is a fire-and-forget `void fetch` (`Editor.tsx:797`)
  with **no** isSaving/saved/lastSaved state anywhere — so "Saving… / All changes
  saved / Last edit N min ago" needs a small NEW state machine around the existing
  save. **S3-1 owns that state** (it owns the title-bar slot): wrap the existing
  body-save so it flips a tiny `saveStatus` state (`'saving' → 'saved'` on settle,
  `'idle'` after a 5-min timer). This is **small NEW logic, honestly flagged** —
  NOT the false "lifecycle the editor already exposes". **S5-9 supplies the COPY
  strings only**, consuming this state. (The save *path* itself is unchanged — the
  wrapper only observes in-flight/settled.)
- comments icon → `onToggleComments` (already on `Editor.tsx:1401`).
- history clock → `onToggleVersionHistory` (`Editor.tsx:1403`).
- Share → `onOpenShare` (`Editor.tsx:1412`, `setShareDialogOpen(true)`).
- avatar → S2-5 cluster.

Sketch (shell only — no logic invented):
```tsx
// DocTitleBar.tsx
export function DocTitleBar({
  docId, initialTitle, saveStatus,
  onToggleComments, onToggleVersionHistory, onOpenShare,
}: Props) {
  return (
    <header className="parchment-titlebar">
      <a href="/files" className="parchment-titlebar-glyph" aria-label="Back to files">📄</a>
      <InlineTitle docId={docId} initialTitle={initialTitle} />   {/* blur → POST /rename, { title } only */}
      <button className="parchment-titlebar-star" aria-pressed={…}>☆</button>
      <button className="parchment-titlebar-move" aria-label="Move">📁</button>
      <span className="parchment-titlebar-savestatus">{saveStatus}</span>  {/* S3-1 state, S5-9 copy */}
      <span className="parchment-titlebar-spacer" />
      <button onClick={onToggleComments} aria-label="Comments">💬</button>
      <button onClick={onToggleVersionHistory} aria-label="Version history">🕐</button>
      <button onClick={onOpenShare} className="parchment-titlebar-share">Share</button>
      {/* S2-5 avatar cluster */}
    </header>
  )
}
```
CSS:
```css
.parchment-titlebar {
  display: flex; align-items: center; gap: 8px;
  height: 56px; padding: 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-chrome);   /* #E8EAED chrome border token */
}
.parchment-titlebar-share {
  height: 36px; padding: 0 16px; border-radius: 18px;
  background: var(--primary); color: var(--on-primary); border: none; cursor: pointer;
}
.parchment-titlebar-share:hover { background: var(--primary-hover); }
.parchment-titlebar-share:active { background: var(--primary-pressed); }
.parchment-titlebar-spacer { flex: 1; }
```
Delete the old `<h1>` at `Editor.tsx:1424` in the same item (the inline title
supersedes it).

**Accept:** title bar present, pinned, 56px, white with `#E8EAED` bottom border;
clicking the title makes it editable, blurring saves the new title (and a reload
shows it) **without altering body content**; Share opens the ShareDialog; comments
and history icons toggle their drawers. **Proves it:** visual-regression surface
**#4 (doc editor — idle)** baseline updated to show the title bar; **axe** on the
editor route (the existing `/d/00000000-0000-0000-0000-0000000000d0` route in
`tests/e2e/a11y.authed.spec.ts`) stays zero-violation with the new header
(role/landmark + label on every icon button).

**Steps:**
1. Snapshot baseline RED: capture surface #4 on `release/v0.1.1` pre-change (plain
   `<h1>`, no title bar).
2. Build `DocTitleBar` shell + CSS; mount above `<Toolbar>`; delete the `<h1>`.
3. Wire the existing handlers (comments/history/share); render star/move disabled
   if no endpoint.
4. TDD the inline-title save (pure logic): unit-test the blur handler issues
   `POST /api/docs/${id}/rename` with `{ title }` only and **never** calls the
   body-PUT or includes `contentJson`/`markdown` (I4 clobber guard — the rename
   endpoint is title-only, so the body cannot be touched).
5. Build the small save-status state wrapper (Decision 4): TDD that an in-flight
   save sets `'saving'`, settles to `'saved'`, and a 5-min idle timer flips to
   `'idle'`; the existing save path is unchanged (the wrapper only observes it).
6. Live-verify on a branch deploy: **edit the title → reload → the title persists
   and the body is byte-for-byte intact** (the rename endpoint cannot wipe content);
   Share/comments/history fire; the save-status slot shows Saving…→saved.
7. Update surface #4 baseline + axe artifact in the PR.

---

### S3-2 — Menu bar (NEW component) ⚠ PARTIAL risk — recommend PARTIAL scoping

**Files:** create `src/components/editor/MenuBar.tsx`, a shared dropdown primitive
`src/components/editor/menus/Menu.tsx` (+ `MenuItem`), and per-menu config under
`src/components/editor/menus/` (File/Edit/View/Insert/Format/Tools/Extensions/Help).
Mount `<MenuBar>` in `Editor.tsx` directly below `<DocTitleBar>` and above
`<Toolbar>`. New CSS `.parchment-menubar*`.

**Current → Target:**
- Current: **the menu bar does not exist** (map: "No File/Edit/View/Insert menu
  structure"). Every function is reached via a `.parchment-toolbar-btn` or a
  keyboard shortcut. There is **no shared dropdown/menu component** in the tree.
- Target: a 32px row below the title bar, `background:var(--surface)`,
  `border-bottom:1px solid var(--border-chrome)` (`#E8EAED`). Eight top items (File ·
  Edit · View · Insert · Format · Tools · Extensions · Help), 14px text (S4-3),
  8px padding, hover = gray pill (`var(--surface-hover)`/`#F1F3F4`), each opening a
  Material-style dropdown via the **S5-3 shared `.px-menu` shell** (elevation owned
  by S5-3, 8px radius, 36px rows).

**Change:** **This is the PARTIAL item.** It needs a NEW shared accessible menu
component (role="menu"/`menuitem`, roving tabindex, ↑↓ nav, Esc-to-close, focus
restore — G15/K3). That primitive does not exist; building it + 8 menus + wiring
every row outgrows a single clean PR. **Recommendation: scope S3-2 PARTIAL.**

> **Shared dropdown ownership (DECISION 6 — closes finding #16).** There is ONE
> shared dropdown across the release. **S5-3 owns the shared overlay-elevation CSS**
> — the `.px-menu`/`.px-menu-item` shell + `--shadow-dropdown` token. S3-2's menu
> component (the accessible `role="menu"` behavior — keyboard nav, focus restore)
> **consumes that shell; it does NOT define its own elevation/shadow.** Build-order
> tension: S5 runs last, but the `--shadow-dropdown` *token* is minted in **S1**, so
> the `.px-menu` shell class can land with the **first consumer** (S3-2 here);
> **S5-3 finalizes/reconciles** the shell. Concretely: S3-2 builds the menu
> **behavior** primitive and styles it with the `.px-menu` class (referencing the
> S1 `--shadow-dropdown` token); S5-3 owns/finalizes that class. S2-1's mega-menu
> and S3-3's overflow `⋯` both consume the **same** `.px-menu` shell + the same
> menu primitive — no second dropdown component is built anywhere. (Names: the menu
> behavior primitive lives at `src/components/editor/menus/Menu.tsx`; if S5-3 also
> exposes a generic `ui/Dropdown.tsx`, it is the SAME shell — pick one file at
> execution time and have all consumers import it; do not ship two.)

Each row must re-surface an EXISTING handler (no new logic) — the wiring map:

| Menu | Row | Existing action it surfaces |
|---|---|---|
| **File** | Version history | `onToggleVersionHistory` (`Editor.tsx:1403`) |
| | Download → Markdown/HTML/Plain/Word/EPUB/LaTeX | the export `<a download href="/api/docs/:id/export?format=…">` links currently in the toolbar fieldset (`Toolbar.tsx:910–930`) |
| | Download → PDF | `onExportPdf` → `setPrintOpen(true)` (`Editor.tsx:1417`) |
| | Page setup | `onOpenPageSetup` → `setPageSetupOpen(true)` (`Editor.tsx:1398`) |
| | Print | `onExportPdf` (PDF/print view) |
| | New / Open / Make a copy / Move / Trash / Email | **no editor-side handler today** → placeholder, see below |
| **Edit** | Undo / Redo | `editor.chain().focus().undo()/.redo()` (TipTap, exists) |
| | Cut / Copy / Paste / Paste w/o formatting / Select all | native `document.execCommand`/clipboard already available; Select all = `editor.commands.selectAll()` |
| | Find and replace (⌘F / ⌘⇧H) | `openFind('find')` / `openFind('replace')` (`Editor.tsx:459–463`) |
| **View** | Show outline | toggles the S3-5 outline pane (new shared open-state, see S3-5) |
| | Print layout / Pageless / Show ruler / Tabs / Full screen | **no backing feature** → placeholder |
| **Insert** | Image | `onInsertImage` (`Editor.tsx:1395`) |
| | Table | `editor` table commands (TableControls already exists) |
| | Link | `onOpenLink` (`Editor.tsx:1396`) |
| | Comment | `onToggleComments` |
| | Footnote / Equation / Drawing / Chart / Special chars / Page break / Header-Footer | route to the existing slash-menu inserts (`SlashMenuExtension`, math/drawing/embed dialogs) where a command exists; otherwise placeholder |
| **Format** | Text B/I/U/Strike/Super/Sub | existing mark toggles (Toolbar already has them) |
| | Paragraph styles (Title/Subtitle/H1–6/Normal) | the existing block-type select / `StylesMenu` |
| | Align / Line spacing / Bullets & numbering / Clear formatting | existing toolbar commands |
| | Columns / Headers-footers / Page numbers | **no backing feature** → placeholder |
| **Tools** | Word count | opens a Word-count modal sourced from `useEditorState` counts already computed (`Editor.tsx:971–984`) |
| | Voice typing | `VoiceButton` action (exists in Toolbar) |
| | Spell check | **placeholder** — `spellcheckEnabled` is a **read-only prop from owner settings**, NOT an in-editor toggle (verified). There is no in-editor spell-check toggle action today, so this row is a disabled "coming soon" placeholder (closes the spellcheck-semantics minor). |
| | Grammar suggestions | `onToggleGrammar` (`Editor.tsx:1409`, only when `grammarEnabled`) |
| | Citation | cite-suggestion flow (`CiteSuggestionExtension`, exists) |
| | AI compose | bubble-menu AI actions (`aiEnabled`, exists) |
| | Personal dictionary / Translate | **no backing feature** → placeholder |
| **Extensions** | Add-ons / Apps Script | **placeholders** (→ Plugins, not built) |
| **Help** | Keyboard shortcuts (⌘/) | existing GlobalShortcuts help |
| | Replay tour / What's new / About | `/whats-new` route exists; tour/about → placeholder/link |

Every **placeholder** renders `aria-disabled` with a "coming soon" affordance —
visibly inert, never a dead no-op (the audit's "placeholder honesty" rule).

> **Placeholder audit (DECIDED — finding #21).** Verified against the code, the
> following menu rows have **no backing action** and ship as disabled placeholders:
> File→New/Open/Make a copy/Move/Trash/**Email**; View→Print layout/Pageless/Ruler/
> Tabs/Full screen; Insert→Chart/Special chars/Header-Footer (where no command
> exists); Format→Columns/Headers-footers/Page numbers; Tools→Personal dictionary/
> **Translate**/Spell check (read-only prop, see above); all of
> **Extensions** (Add-ons / Apps Script — Plugins not built); Help→Replay tour/
> About. **S3-2 is honestly scoped PARTIAL** with the shipped-vs-placeholder split
> recorded in scope.md — never DONE while any spec'd row is a placeholder.

Sketch of the shared primitive (the load-bearing new component):
```tsx
// menus/Menu.tsx — accessible dropdown, role=menu, ↑↓/Esc/focus-restore
// menus/MenuItem.tsx — role=menuitem; { label, onSelect?, shortcut?, disabled? }
// MenuBar.tsx maps a config array → <Menu> per top item.
const FILE_MENU: MenuConfig = [
  { label: 'Version history', onSelect: onToggleVersionHistory },
  { label: 'Download', submenu: [
      { label: 'Markdown (.md)', href: `/api/docs/${docId}/export?format=md`, download: true },
      /* …html/txt/docx/epub/tex… */
      { label: 'PDF', onSelect: onExportPdf },
  ]},
  { label: 'Page setup', onSelect: onOpenPageSetup },
  { label: 'Email', disabled: true, hint: 'Coming soon' },
]
```

**Accept:** each top item opens a Material dropdown; every **non-placeholder** row
fires its real action on click (live-verified, not just rendered); placeholders are
visibly disabled. Item logged in `scope.md` as `PARTIAL (n%)` with the exact
shipped-vs-placeholder list and percent — **never `DONE`** while any spec'd menu or
sub-row is a placeholder. **Proves it:** visual-regression surface — add a baseline
for "editor with a menu dropdown open" (the README lists "every menu/dropdown menu"
among the live-deploy set; the 7 committed baselines cover **#4 editor-idle** with
the menu bar row visible and **#5 editor toolbar-overflow** — capture the open File
menu as a live-deploy screenshot per the per-PR artifact rule); **axe + keyboard
walk** of the menu bar and one dropdown (role=menu, arrow-nav, Esc, focus restore).

**Steps:**
1. RED baseline: surface #4 pre-change (no menu bar row).
2. TDD the shared `Menu` primitive (pure interaction logic): unit/Playwright tests
   for ↑↓ roving focus, Esc close + focus restore, Enter/Space activate, `disabled`
   rows skip focus.
3. Build `MenuBar` + per-menu config; wire only existing handlers; mark every
   unbacked row `disabled`.
4. Live-verify: click every non-placeholder row → its drawer/dialog/command fires;
   click every placeholder → inert + "coming soon".
5. Update surface #4 baseline (menu bar visible), capture File-menu-open live
   screenshot, run axe + keyboard walk.
6. Write `scope.md` PARTIAL: list shipped rows vs placeholders + percent.

---

### S3-3 — Editor toolbar restyle (single light row + overflow ⋯)

**Files:** `src/components/editor/Toolbar.tsx` (reorder/regroup the existing
controls — render root at line 265), `globals.css` (`.parchment-toolbar*`
**463–568**).

**Current → Target:**
- Current: `.parchment-toolbar { display:flex; flex-wrap:wrap; gap:2px;
  padding:4px 8px; background:var(--paper); border:1px solid var(--border);
  border-radius:6px; margin-bottom:8px }` (globals.css 465–475). Buttons
  `.parchment-toolbar-btn` 28px tall, 0.85rem, transparent bg, pressed =
  `var(--accent-contrast)` (#6d28d9 purple) white. Separators `.parchment-toolbar-sep`
  1px × 20px `var(--border)`. The row **wraps** to multiple lines; no overflow menu;
  50+ controls all equal weight.
- Target: a single **48px** row, `background:#FFFFFF` (`var(--surface)`),
  `border-bottom:1px solid #E8EAED` (`var(--border-chrome)`), pinned below the menu
  bar, **no border-radius, no wrap** — drop the dark/purple theme. Icons 20px (S4-3),
  hover pill `#F1F3F4` (`var(--surface-hover)`), **active pill `#E8F0FE` blue**
  (`var(--primary-surface)`, minted by S1 — no literal). Order: Undo · Redo · Print ·
  **Spell check ⊘** · **Format painter ⊘** · **Zoom ▾ ⊘** · | · **Styles ▾** · |
  · **Font ▾** (Arial default + the audit list) · Font size (`−`/`+` chip) · | ·
  **B I U S** · Text color · Highlight · | · Link · Comment · Image · | · **Align
  ▾** · **Line spacing ▾** · Bulleted · Numbered · Outdent · Indent · Clear
  formatting · | · Editing-mode ▾ (right-aligned — S5-10). Overflow `⋯` rightmost
  collapses controls that don't fit at narrow widths.

  > **⊘ = disabled placeholder (DECIDED — finding #21).** **Format painter**,
  > **Zoom ▾**, and **Spell check** do NOT exist in the code today — grep of
  > `Toolbar.tsx`/`src/lib/editor` finds no `formatPainter`/`copyFormat`, no
  > user-facing zoom control (the only scale logic is the automatic mobile page-fit
  > `ResizeObserver`, not a control), and no spell-check toggle button. Format
  > painter is genuinely new feature logic. They ship as **`aria-disabled`
  > "coming soon" placeholders** (consistent with the S3-2 menu-placeholder rule),
  > NOT as reorderable existing controls. **S3-3 surfaces only EXISTING controls as
  > real** — the rest are visibly-inert placeholders, logged in scope.md.

**Change:** **restyle + reorder of EXISTING controls; the three net-new controls
(Format painter / Zoom / Spell check) ship as disabled placeholders, not real
behavior.** The existing buttons (B/I/U/S, color, link, comment, image, lists,
align, etc.) keep their current `onClick` handlers; this item rearranges their JSX
order and swaps classes. The `⊘` placeholders render `aria-disabled` + "coming
soon" — they add no feature logic. **S3-3 is therefore scoped PARTIAL** (shipped:
the existing-control restyle + reorder + overflow; placeholdered: Format
painter/Zoom/Spell check) — log the split in scope.md, do not claim DONE while a
placeholder is present. CSS edits:
```css
.parchment-toolbar {
  flex-wrap: nowrap;            /* was wrap */
  height: 48px;                 /* single row */
  gap: 2px; padding: 0 8px;
  background: var(--surface);   /* was var(--paper) */
  border: none;
  border-bottom: 1px solid var(--border-chrome);  /* #E8EAED chrome border token */
  border-radius: 0;             /* was 6px */
  margin-bottom: 0;             /* chrome stacks flush; canvas gutter via S1-2 */
  overflow: hidden;             /* hidden controls go to the ⋯ menu */
}
.parchment-toolbar-btn { height: 32px; min-width: 32px; }        /* icon btn 32×32 / 20px glyph (S4-4) */
.parchment-toolbar-btn:hover { background: var(--surface-hover); } /* #F1F3F4 hover pill, was var(--border) */
.parchment-toolbar-btn[aria-pressed="true"] {
  background: var(--primary-surface);   /* #E8F0FE active pill (S1) */
  color: var(--primary);                /* was #fff on purple */
  border-color: transparent;
}
```
- **Overflow `⋯`** is the one genuinely-new piece of toolbar markup: a
  rightmost button that opens a dropdown (reuse the S3-2 `Menu` primitive) holding
  exactly the controls hidden at the current width. Drive visibility with a
  `ResizeObserver` on the toolbar (same pattern already used for page-fit in
  `Editor.tsx:677`). Each control appears **once** — either inline or in the
  overflow, never both. This adds layout logic, not feature logic.
- Editing-mode ▾ placeholder is **S5-10** placed here, right-aligned.
- The existing pressed-state on history/comments/share/reading/presenter/source
  buttons (`aria-pressed`, Toolbar 776–904) is preserved — only the pill colors
  change.

**Accept:** one light 48px toolbar in the stated order, no purple, no wrap;
resizing the viewport collapses the trailing controls into a single `⋯` menu that
holds exactly the hidden controls (once each); each control still fires.
**Proves it:** visual-regression surface **#5 (editor with toolbar overflow `⋯`
open)** — its committed baseline directly gates the overflow behavior — plus
surface **#4 (editor idle)** for the light single-row look; **axe** for the
toolbar role + every icon button's label.

**Steps:**
1. RED baseline #4 + #5 pre-change (dark wrapping toolbar, no overflow).
2. CSS restyle (light, 48px, no-wrap, new pills); reorder the JSX to the spec order.
3. TDD the overflow partition (pure logic): a `partitionControls(width)` helper —
   test that every control id lands in exactly one bucket and the `⋯` bucket equals
   the hidden set, at 3 widths.
4. Implement the ⋯ menu (reuse S3-2 `Menu`); wire the ResizeObserver.
5. Live-verify at 3 widths; click a control from the ⋯ menu → it fires.
6. Update #4 + #5 baselines + axe in the PR.

---

### S3-4 — Drop the export-format text strip

**Files:** `src/components/editor/Toolbar.tsx` — remove the export `<fieldset
className="parchment-toolbar-export">` (lines **906–940+**, the legend "Export" +
the 6 `<a download>` links md/html/txt/docx/epub/tex + the PDF `<button>`).
`globals.css` — remove the now-unused `.parchment-toolbar-export*` rules.

**Current → Target:**
- Current: a flat `<fieldset>` with `<legend>Export</legend>` containing 6 download
  links and 1 PDF button, all styled `.parchment-toolbar-btn`, sitting in the
  toolbar (no dropdown, no grouping — map: "not a proper dropdown menu").
- Target: **no standalone export strip.** All export routes live under **File →
  Download** (built in S3-2), which reuses the **same** `href` + `onExportPdf`
  wiring this strip used.

**Change:** **deletion only — the export handlers move, they don't change.** The
six `download` hrefs (`/api/docs/${docId}/export?format=…`) and the `onExportPdf`
prop become rows in the File → Download submenu (S3-2 table). No export logic is
added or removed (the v0.1.0 export registry is untouched). **Depends on S3-2** —
do not delete the strip until File → Download is verified live, or downloads
become unreachable.

**Accept:** the editor toolbar shows no Export fieldset/legend; every format
(md/html/txt/docx/epub/tex/PDF) is reachable from File → Download and downloads the
correct file. **Proves it:** surface **#4 (editor idle)** baseline no longer shows
the export strip; live-deploy screenshot of File → Download open with the 7 rows;
a manual download of one format succeeds.

**Steps:**
1. (After S3-2 verified) RED baseline #4 still showing the strip.
2. Remove the `<fieldset>` JSX + its CSS.
3. Live-verify each format from File → Download downloads the right file.
4. Update #4 baseline; attach the File→Download screenshot.

---

### S3-5 — Outline pane redesign (light left-rail)

**Files:** `src/components/editor/OutlinePane.tsx` (render 136–212; header
154–156); `globals.css` `.parchment-outline*` (**1182–1349**); `Editor.tsx`
(outline mount at **1445**, inside the flex row 1437–1500). Wire the View → Show
outline toggle (S3-2) to a shared open-state.

**Current → Target:**
- Current: `.parchment-outline { width:220px; border-right:1px solid var(--border);
  background:color-mix(in srgb, var(--background) 90%, var(--paper)) }` — reads dark
  in dark theme; collapses to 32px. Title `.parchment-outline-title` 0.7rem
  uppercase 0.07em `var(--muted)`. Items 0.82rem, indent **12px per level**
  (`(level-1)*12`, OutlinePane.tsx:165). Hover turns the *link text* `var(--accent)`
  (purple), not a row background. No active-heading highlight. Toggle is an internal
  chevron button (`.parchment-outline-toggle`, top:8px right:6px) — not driven by a
  View menu.
- Target: a light left-rail INSIDE the editor route (between the global sidebar and
  the canvas, where it already sits), **256px**, `background:#F8F9FA`
  (`var(--surface-muted)`), `border-right:1px solid #E8EAED` (`var(--border-chrome)`),
  collapsible. Header "Outline" + chevron. Heading rows **14px Roboto** (S4-1/S4-3),
  indent by level (H1 0 / H2 12px / H3 24px — i.e. keep `(level-1)*12`), **active
  row light-blue bg** (`var(--primary-surface)`/`#E8F0FE`). Toggle via View → Show
  outline (S3-2).

**Change:** **restyle + token swap + add an active-row class — no new outline
logic.** The heading collection (`collectHeadings`, the `update` listener at
OutlinePane.tsx:34–42), drag-to-reorder, and jump-to-heading are untouched
(preserve the G7 no-infinite-loop + G8 live-PM-node lessons — outline still rebuilds
only on `editor.on('update')`, headings still resolve from `editor.getJSON()`).
CSS:
```css
.parchment-outline {
  width: 256px; min-width: 256px; max-width: 256px;   /* was 220px */
  background: var(--surface-muted);                    /* #F8F9FA, was the dark color-mix */
  border-right: 1px solid var(--border-chrome);        /* #E8EAED chrome border token */
}
.parchment-outline-link { font-size: 14px; }           /* was 0.82rem */
.parchment-outline-link:hover { color: var(--foreground); background: var(--surface-muted); } /* was color:var(--accent) */
.parchment-outline-item[aria-current="true"],          /* active heading row */
.parchment-outline-item--active {
  background: var(--primary-surface);                  /* #E8F0FE */
}
```
- Add an `aria-current`/`--active` class on the heading row matching the cursor's
  current section. Computing "which heading is active" from the existing
  `entries`/selection is **derived state, not a new feature** — fold it into the
  existing `update` handler (no new effect/loop).
- **Shared open-state for View → Show outline (S3-2):** today `paneOpen` is local
  to `OutlinePane` (`useState(true)`, line 26). Lift it (or expose an imperative
  toggle) so the View menu can drive it. Keep the internal chevron as a second
  trigger of the same state — both must stay in sync (no two competing booleans).

**Accept:** the outline rail uses `var(--surface-muted)` (`#F8F9FA` in light;
`#35363A` in dark — it **follows the scheme**, it is NOT forced light) and
`var(--border-chrome)`, 256px; the heading at the cursor is highlighted light-blue
(`--primary-surface`); View → Show outline hides/shows it and stays in sync with the
chevron. (Closes the S3-5 dark-token minor: the original "light in both themes"
claim was wrong — the rail is `--surface-muted`, which is **dark in dark mode**; the
goal is "no longer the bespoke `color-mix` dark blend, just the standard muted
surface that follows the scheme.")
**Proves it:** visual-regression surface **#4 (editor idle, outline open)** baseline
shows the light rail + active row; **axe** keeps the nav landmark + button labels
clean.

**Steps:**
1. RED baseline #4 with the dark outline.
2. CSS restyle (256px, `--surface-muted`, `--border-chrome`, 14px, light hover).
3. Add the active-row derivation inside the existing `update` handler + the
   `--active` class (TDD the "active heading id from selection" pure helper).
4. Lift `paneOpen` to a shared toggle; wire View → Show outline (S3-2).
5. Live-verify in light AND dark theme; move the cursor → the active row tracks it;
   View toggle + chevron stay in sync.
6. Update #4 baseline + axe.

---

### S3-6 — Bottom status bar restyle (slim white bar)

**Files:** `src/components/editor/StatusBar.tsx` (full file, 47 lines; root at 19);
`globals.css` `.parchment-status-bar` (**437–444**); `Editor.tsx` — the
`<OfflineIndicator>` (line **1506**) folds into the status bar's connection slot.

**Current → Target:**
- Current: `.parchment-status-bar { margin-top:8px; font-size:0.78rem;
  color:var(--muted); text-align:right; padding:0 4px; user-select:none }`
  (globals.css 437–444). Content (StatusBar.tsx 18–45): `Page N` · word/char counts
  (full or selection) · **"N min read"** (always, when no selection) · "👁 N
  reading". It's a right-aligned inline line *above* nothing, not a footer bar;
  `OfflineIndicator` is rendered as a separate sibling (Editor.tsx 1506), not inside
  it.
- Target: a **24px** full-width footer, `background:#FFFFFF` (`var(--surface)`),
  `border-top:1px solid #E8EAED` (`var(--border-chrome)`). Left: "Page 1 of 1". Center:
  word count (small; clicking it opens Tools → Word count modal — S3-2). Right:
  editing-mode hint (S5-10) + a connection dot (the `OfflineIndicator` state).
  **Drop "N min read" by default** (surface it only inside Tools → Word count).

**Change:** **layout restyle + drop one string + relocate the connection dot — no
count logic changes.** The `pageCount`, `full`/`selection` counts, and `readers`
props are unchanged (still fed from `Editor.tsx:1508–1513`); only the JSX layout and
the read-time line change. Edits:
- Remove the `· {readTime} min read` segment from the full-count branch
  (StatusBar.tsx 28–32); `readingTimeMinutes` stays imported only if the
  Word-count modal uses it, else drop the import.
- Restructure into three slots (left/center/right) instead of one right-aligned line.
- Accept the `OfflineIndicator`'s connection state as a prop (or render
  `<OfflineIndicator>` inside the right slot) so the dot lives in the bar; remove
  the standalone sibling at Editor.tsx:1506.
- **OfflineIndicator glyph + copy (closes the S3-6 OfflineIndicator minor):**
  replace the emoji pill with a small **colored connection dot** — green
  (`--success`) when online, amber (`--warning`) when "Syncing…", gray/`--muted`
  when "Offline" — plus a 12px label. Copy: **"Offline"** (disconnected),
  **"Syncing…"** (reconnecting/flushing), no label when steadily online (dot only).
  The dot + label sit in the status bar's right slot. This is a glyph/copy swap on
  the existing indicator state — no new connection logic.
- "Page 1 of 1" wording (current is "Page {pageCount}") — add the total
  (`Page {n} of {pageCount}`) using values already in scope.
CSS:
```css
.parchment-status-bar {
  display: flex; align-items: center; justify-content: space-between;
  height: 24px; width: 100%;
  margin-top: 0; padding: 0 16px;
  background: var(--surface);
  border-top: 1px solid var(--border-chrome);   /* #E8EAED chrome border token */
  font-size: 12px; color: var(--muted);
  user-select: none;
}
```

**Accept:** a slim 24px white status bar with a top `#E8EAED` border showing
page / word count / editing-mode / connection dot; no "min read" by default; the
word count opens the Tools → Word count modal; the connection dot reflects
online/offline. **Proves it:** surface **#4 (editor idle)** baseline shows the slim
white footer (no read-time); **axe** keeps `role="status"`/`aria-live` valid.

**Steps:**
1. RED baseline #4 with the heavy right-aligned status line.
2. Restyle CSS (24px, white, top border, three-slot flex).
3. Remove the read-time string; restructure the JSX into left/center/right.
4. Fold `OfflineIndicator` into the right slot; remove the standalone sibling.
5. Wire the center word-count click → Tools → Word count modal (S3-2).
6. Live-verify online + offline; update #4 baseline + axe.

---

## Coverage check
- **Audit gaps closed (mapped to real code):** missing Docs title bar — currently a
  plain `<h1>` at `Editor.tsx:1424` (S3-1); missing menu bar — confirmed
  non-existent, no shared dropdown component in the tree (S3-2, **PARTIAL**); dark
  wrapping ad-hoc toolbar `.parchment-toolbar` purple-pressed (S3-3); the flat
  export `<fieldset>` strip `Toolbar.tsx:906–940` (S3-4); the dark `color-mix`
  220px outline with no active-row highlight (S3-5); the heavy right-aligned
  status line with always-on read-time `StatusBar.tsx:28–32` (S3-6).
- **Cross-plan (verified, canonical tokens):** title-bar Share/avatar use the FIXED
  `--primary`/`--on-primary` + S2-5 cluster; **save-status STATE = S3-1 (Decision
  4), COPY = S5-9** (S5-9 is copy-only, consuming S3-1's state); editing-mode
  dropdown is S5-10, placed by S3-3 (toolbar) and surfaced again in S3-6 (status
  hint); menu/toolbar/outline glyphs = S4-3 (20px) over **faces loaded by S1-8**,
  text = S4-3 (14px Roboto); **dropdown elevation = the S5-3 shared `.px-menu` shell
  + `--shadow-dropdown`, which S3-2/S3-3 CONSUME (Decision 6)**; the active pill +
  active-row blue use **`--primary-surface` (minted by S1-7 — finding #2 resolved,
  no literal, no "add to S1 if missing" hedge)**; chrome borders use
  `--border-chrome`; export rows = the existing export registry hrefs (no new
  formats). **Every non-placeholder menu/toolbar/status entry maps to a handler that
  already exists on `Editor.tsx`/`Toolbar.tsx`** (wiring table in S3-2).
- **Out of scope (owned elsewhere / not built):** the actual export/voice/AI/citation
  logic (shipped v0.1.0 — S3 only re-surfaces it); the inline-title save uses the
  **existing title-only `/rename` endpoint** (Decision 3) — **no new backend
  behavior**, and it cannot clobber the body. Menu rows with **no backing feature**
  (File: New/Open/Copy/Move/Trash/Email; View: Print layout/Pageless/Ruler/Tabs/Full
  screen; Insert: Chart/Special chars/Header-Footer where no command exists; Format:
  Columns/Headers-footers/Page numbers; Tools: Personal dictionary/Translate/Spell
  check; all of Extensions/Add-ons/Apps Script; Help: Replay tour/About) **plus the
  S3-3 toolbar Format painter / Zoom / Spell check** ship as **visibly-disabled
  placeholders** → **S3-2 AND S3-3 are logged `PARTIAL (n%)`** with the exact
  shipped-vs-placeholder list, never `DONE`.

## Newly-discovered gaps / scoping flags
- **S3-2 is firmly PARTIAL.** The shared accessible menu **behavior** primitive does
  not exist in the codebase. **Per Decision 6 it consumes the S5-3 `.px-menu` shell
  + `--shadow-dropdown` (minted in S1) — it does NOT build a second dropdown
  component or its own elevation.** Building the behavior primitive + 8 menus +
  wiring is bigger than one PR. Ship the menus that wrap existing handlers, mark the
  rest placeholders (see the placeholder audit), record `PARTIAL (n%)` in `scope.md`.
- **S3-3 overflow `⋯` is the one new toolbar mechanism** (the rest is restyle of
  existing controls; Format painter/Zoom/Spell check are disabled placeholders). It
  reuses the **same** S3-2/S5-3 shared menu shell, so **S3-3 has a soft dependency
  on the menu primitive landing first** — sequence the primitive (S3-2) before S3-3's
  overflow. **S3-3 is also PARTIAL** (the three placeholdered controls).
- **S3-1 has two small NEW bits, both honestly flagged:** (a) the inline-title save
  via the **existing title-only `/rename` endpoint** (Decision 3 — no new backend,
  cannot clobber the body); (b) the **save-status state wrapper** (Decision 4 — a
  small in-flight→settled→idle state around the existing fire-and-forget save, since
  no such state exists today). Neither is a "feature" but neither is "pure shell" —
  both are scoped and tested.
- **`--primary-surface` (`#E8F0FE`) is minted by S1-7** (canonical vocabulary) — no
  "add to S1 if missing" hedge remains; S3 consumes `var(--primary-surface)` for the
  active toolbar pill + active outline row, and `var(--border-chrome)` for chrome
  borders.
- **No visual-regression harness exists yet.** `tests/e2e/` has only the axe specs
  (`a11y.authed.spec.ts` covers the editor route
  `/d/00000000-0000-0000-0000-0000000000d0`); there is **no `*-snapshots*`
  directory and no `toHaveScreenshot` spec**. The README's 7-surface visual-
  regression gate must be **stood up** (a `visual.spec.ts` + committed baselines)
  as part of executing S3 — it is a prerequisite for the per-PR RED/GREEN artifacts,
  not assumed to exist.

## Failure-modes-verified
- **Dead menu rows** (a menu item wired to nothing) → per-PR live click-through of
  every non-placeholder row against the S3-2 wiring table; a row that no-ops is a
  defect, not DONE.
- **Placeholder honesty** (Email/Extensions/Translate/Columns in the menu bar, AND
  Format painter/Zoom/Spell check in the toolbar — all look real but have no backing
  action) → every one renders `aria-disabled` + "coming soon"; **S3-2 AND S3-3** are
  logged `PARTIAL` with the exact shipped-vs-placeholder list + percent. S3-3
  surfaces only EXISTING controls as real (finding #21).
- **Toolbar overflow breakage** (the `⋯` drops or duplicates controls at narrow
  widths) → the `partitionControls(width)` unit test asserts every control id is in
  exactly one bucket; responsive snapshots at 3 widths; the overflow menu contains
  exactly the hidden controls, once each.
- **Title save clobbers the body** (the original "PATCH /api/docs/:id reusing the
  body-PUT" mistake — a 404 or, worse, an empty-body write) → S3-1 uses the
  **existing title-only `POST /api/docs/[id]/rename`** (backed by `renameDocument`),
  which writes only the title and **cannot touch `contentJson`/`markdown`**. Verify:
  edit the title, reload, assert the title changed AND the body is byte-for-byte
  intact (the I4 clobber is structurally impossible via this endpoint). Unit-test
  that the blur handler calls `/rename` with `{ title }` only and never the
  body-PUT.
- **Outline rebuild loop / staleness** (G7 infinite-loop + G8 node.type lessons) →
  the outline still rebuilds only on `editor.on('update')` (OutlinePane.tsx:34–42);
  headings + the new active-row id resolve from live `editor.getJSON()`/selection,
  not JSON-shape assumptions; no new effect that re-triggers on its own output.
- **Outline toggle desync** (View → Show outline vs the internal chevron driving two
  booleans) → both triggers mutate ONE shared open-state; toggling either reflects
  in the other.
- **Menu/toolbar a11y** (role=menu, roving tabindex, ↑↓ nav, Esc, focus restore —
  G15/K3) → axe + a keyboard walk of the menu bar and every dropdown; the new
  `Menu` primitive is unit-tested for focus restore on Esc.
- **Chrome height stack** (title 56 + menu 32 + toolbar 48 = 136px of fixed chrome
  pushing the canvas + 24px status bar off-screen) → snapshot the editor at idle
  (surface #4); canvas and the slim status bar must remain visible; the chrome rows
  stack flush (no double margins — S3-3 drops the toolbar's `margin-bottom:8px`).
  **On narrow viewports the editor-chrome reflow is owned by S2-6** (responsive
  chrome) — S3 stacks flush at desktop width; S2-6 handles the phone case.
- **Export unreachable after strip removal** (S3-4 deletes the strip before File →
  Download exists) → S3-4 depends on S3-2; verify all 7 formats download from File →
  Download before removing the fieldset.
- **Dark-theme bleed on re-homed surfaces** (outline/status now light) → live-verify
  S3-5 + S3-6 in light AND dark; the light `#F8F9FA`/white surfaces must come from
  S1 vars and not invert wrongly under dark theme.
