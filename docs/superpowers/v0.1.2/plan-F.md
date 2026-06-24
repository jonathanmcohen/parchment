# Plan F — function gaps caught in the live sweep

> 🟢 **GO — executing.** Plans verified (5-lens review, findings fixed 2026-06-24).
> Grounded against the v0.1.1 code (`release/v0.1.2` = `main` @ `v0.1.1`). **Read the
> deploy-state caveat in
> [README](README.md):** the sweep likely hit the stale v0.1.0 deploy, so F2 / F5
> / F8 / F10 reported gaps are partly already-closed in code — each carries a
> reproduce-first Step 1. **No new feature logic** except where explicitly named
> and scoped PARTIAL (F3 highlight-color/insert-comment, F7 workspace persistence,
> F9 per-email). All colors come from S1 tokens — no hardcoded hex.

**Token contract (from v0.1.1 plan-S1):** `--primary` (#1A73E8) / `--primary-hover`
/ `--primary-pressed` / `--primary-surface` (#E8F0FE active pill) / `--on-primary` /
`--surface` (white) / `--surface-muted` (#F8F9FA) / `--surface-hover` (#F1F3F4) /
`--border-chrome` (#E8EAED chrome borders) / `--foreground` (#202124 light, #E8EAED
dark) / `--muted`. Reference the var, never the literal.

---

### F1 — Theme switch actually applies

**Files:** `src/app/(app)/settings/account/page.tsx:44-66` (the dead `<select>`);
reference `src/components/settings/AppearanceSettings.tsx:65-117` (the WORKING
onChange+save+refresh); `src/app/api/settings/theme/route.ts:1-28` (PUT endpoint,
exists); `src/app/(app)/layout.tsx:98-107` (`data-color-scheme` + `themeCssVars`
inline); `src/lib/docs/settings-repo.ts:58-69` (`setWorkspaceTheme`, exists).

**Current → Target:**
- Current: the Account page renders a static `<select>` (lines 55-64) with
  `defaultValue` only — **no `onChange`, never saves.** Selecting "Light" on a dark
  OS does nothing; the chrome stays dark. The backend (`PUT /api/settings/theme` →
  `setWorkspaceTheme`) and the layout's `data-color-scheme`/`themeCssVars` cascade
  **already work** — the only break is the front-end control on the Account page.
  The real `AppearanceSettings` component (used on the Workspace page) already wires
  onChange → POST → `router.refresh()`.
- Target: the Account theme control re-themes the app **without a manual reload** on
  light/dark/system change, and persists to the DB.

**Change:** **wiring, no new backend.** Prefer **(A)** replace the Account page's
static `<select>` with the existing `AppearanceSettings` component (single source of
truth) — or **(B)** wire the select's `onChange` to `PUT /api/settings/theme` then
`router.refresh()` exactly as `AppearanceSettings:65-81` does. `router.refresh()` is
required: `themeCssVars` + `data-color-scheme` are server-rendered on the layout
(`layout.tsx:99-100`), so the new values only take effect after the RSC re-fetch.

**Accept:** from a dark-mode browser, set Account → Appearance to **Light**; the app
chrome turns light immediately (no reload) and the choice survives a hard reload
(persisted). System follows the OS. **Proves it:** visual surface **#7 (settings →
Account)** baseline (light + dark); a live toggle dark→light→system recorded; Network
shows the `PUT /api/settings/theme`.

**Steps:**
1. RED: surface #7 pre-change; confirm the select fires no network call on change.
2. Adopt `AppearanceSettings` on the Account page (option A) — or wire onChange+refresh.
3. Live-verify the dark→light→system cascade with no reload; confirm persistence.
4. Update #7 baseline (light + dark) + the toggle recording.

---

### F2 — Page-body ink correct in dark ⚠ reproduce-first

**Files:** `src/app/globals.css:2073-2090` (`.parchment-prose` color rules);
`src/styles/tokens.css:22-146` (`--foreground` light #202124 / dark #E8EAED, `--muted`
#5F6368/#9AA0A6); the editor wrapper chain in `Editor.tsx` / `PageCanvas.tsx`.

**Current → Target:**
- Current (code): `.parchment-prose { color: var(--foreground) }` (`globals.css:2079`),
  headings likewise (`:2089`). In dark mode `--foreground` = #E8EAED — **already
  scheme-correct on the dark page.** The reported "#5F6368-ish unreadable body text"
  is `--muted`, and **no rule in the v0.1.1 code forces prose to `--muted`.** This is
  very likely a **stale-deploy (v0.1.0) artifact** — OR a real override on a *parent*
  wrapper (`.parchment-page-content`, an editor wrapper) that sets `color:--muted`,
  OR a high-contrast / dyslexic-font interaction.
- Target: page body + the S4-2 H1–H6 ramp render at `--foreground` in **every**
  scheme (light #202124, dark #E8EAED, HC dark #FFFFFF), independent of any chrome
  experiment.

**Change:** **reproduce-first, then minimal CSS.** If the bug does not reproduce on a
fresh `release/v0.1.2` build, the item is a **stale-deploy artifact** → close as
"verified correct + redeployed" (still capture the light/dark baseline). If it *does*
reproduce, trace the computed `color` on a body `<p>` to its source and fix the
**overriding rule** (most likely a parent setting `color:var(--muted)`); do not just
re-assert `--foreground` on `.parchment-prose` without finding the real cause. Page
ink must read `--foreground` even if a future chrome theme changes — so scope the
page-content color to the page, not inherited from chrome experiments.

**Accept:** in dark mode the page body + headings are clearly readable
(`--foreground`/#E8EAED, not #5F6368); light unchanged; HC-dark = #FFFFFF.
**Proves it:** surface **#1 (editor idle)** baseline in **dark**; DevTools-computed
color on a body `<p>` resolves to `var(--foreground)` with the source rule named.

**Steps:**
1. **Reproduce-first:** fresh `release/v0.1.2` build, dark mode, open a doc with body
   text + headings; read computed `color`. Record whether the grey ink reproduces.
2. If stale-deploy artifact: close as verified + ensure the v0.1.1 redeploy lands.
3. If real: name the overriding rule (file:line), fix it at source; verify no other
   surface (selection, code blocks) regresses.
4. Update surface #1 dark baseline; record the computed-color trace.

---

### F3 — Missing toolbar controls ⚠ PARTIAL-risk (highlight-color, insert-comment)

**Files:** `src/components/editor/Toolbar.tsx` — font-family select (716-735, the
`FONT_FAMILIES` array at 52-59), font-size numeric+unit (739-763, `applySize` at 271),
text color (704), highlight toggle (687-698, **no color**), link (894-905), image
(866-877), comment sidebar toggle (1036-1048), mode dropdown (1223). Possibly a Tiptap
highlight extension under `src/lib/editor/extensions/`.

**Current → Target (grounded — 7 of 8 already exist):**
- **Font family:** exists but only 6 entries (System/Serif/Mono/Arial/Times/Courier)
  and no "More fonts…". → **replace** the 6 generic entries with the **exact 10 Google-
  Docs families**, in this order: **Arial** (default) · Calibri · Cambria · Comic Sans
  MS · Courier New · Georgia · Helvetica · Times New Roman · Trebuchet MS · Verdana —
  plus a trailing **"More fonts…"** entry (a disabled "coming soon" affordance; a real
  font-picker dialog is out of scope). The generic System/Serif/Mono are dropped (Arial/
  Times New Roman/Courier New cover them). Final list = exactly 10 named families + "More
  fonts…". **Pure data — `setFontFamily` already exists.**
- **Font size:** numeric input + pt/px unit exists; **missing −/+ chips.** → add two
  buttons calling `applySize(value ∓ 1, unit)` (handler exists), preserving the unit.
- **Text color:** exists (704). No change.
- **Link / Image / Mode dropdown:** exist (link 894, ⌘K already; image 866; mode 1223
  right-aligned). No change — confirm live.
- **Highlight COLOR picker:** **MISSING.** The highlight button is toggle-only; there
  is **no `setHighlightColor`** in Tiptap core. → **new logic** (PARTIAL-risk): a
  color attr on the highlight mark/extension + a picker control.
- **Insert-comment (per selection):** **MISSING** as a toolbar control — only the
  sidebar `onToggleComments` exists. Per-selection comment insertion may **collide
  with the D1 thread-sidebar model** (comments are threads, not inline-suggestion
  marks). → **new logic** (PARTIAL-risk); evaluate reusing the D1 comment-create flow.

**Change:** ship the **pure-data + reuse-handler** parts (font list, size chips) as
real controls. Scope the **highlight-color picker** and **insert-comment button** as
the **named PARTIAL gap** if they cannot land cleanly: either land them on the D1/
highlight extension, or render the highlight-color swatch + comment button as
`aria-disabled` "coming soon" and log `F3 PARTIAL (n%)` with exactly these two.

**Accept:** the toolbar font dropdown shows **exactly** the 10 named families (Arial
default) + a "More fonts…" affordance (generics gone), a working font-size −/+ that
preserves the unit, and either a working highlight-color picker + insert-comment OR
honest disabled placeholders for those two (logged). Every shipped control applies to
the selection live. **Proves it:** surface **#2 (toolbar full-width with controls)**
baseline (light + dark); axe on the toolbar (every icon labelled).

**Steps:**
1. RED: surface #2 pre-change (6 fonts, no size chips, toggle-only highlight).
2. Expand `FONT_FAMILIES`; verify each family CSS-applies to selected text.
3. Add font-size −/+ chips → `applySize`; TDD unit preservation + 1–999 bounds.
4. Attempt the highlight-color extension attr + picker; attempt insert-comment via the
   D1 create flow. If either outgrows the window → disabled placeholder + log PARTIAL.
5. Live-verify each shipped control; update #2 baseline + axe.

---

### F4 — Merge Block + Styles into one "Styles" dropdown

**Files:** `src/components/editor/Toolbar.tsx:464-487` (the "Block" select at 464-482,
`BLOCK_TYPES` at 77, `handleBlockTypeChange` at 275-305; the `StylesMenu` at 487);
`src/components/editor/StylesMenu.tsx:19-99` (fetch `/api/settings/styles`,
`applyStyleProps` 79-99).

**Current → Target (grounded — "Title/Subtitle" are NOT block types):**
- Current: TWO adjacent controls — a "Block" `<select>` (`BLOCK_TYPES`: Paragraph/H1–6/
  Blockquote/Code) and a separate "Styles" menu (named paragraph/character styles from
  the workspace config; `DEFAULT_STYLES` in `src/lib/editor/styles.ts` = **Body, Title,
  Emphasis, Code** — note **Title is a named style, NOT a block type, and Subtitle does
  not exist**).
- Target: ONE dropdown labelled **"Styles"**, drop the "Block" label, listing the
  user's requested set, each mapped to its real source:
  - **Normal text** = the `paragraph` block type (relabel "Paragraph" → "Normal text" in
    the dropdown's display name only).
  - **Heading 1–6** = the `heading` block types (exist in `BLOCK_TYPES`).
  - **Title** = the existing **named style** `Title` (`DEFAULT_STYLES`).
  - **Subtitle** = a **new named-style data entry** added to `DEFAULT_STYLES` (a paragraph
    style: larger, `--muted` ink — **data, not logic**; honestly flagged as the one new
    addition, ~1 line in the styles seed).

**Change:** **wiring/merge + one data entry — no new component logic.** Combine into a
single `onChange` that routes a block-type choice through `handleBlockTypeChange` and a
named-style choice through `applyStyleProps`. Render the block types first (Normal text,
Heading 1–6 — keep Blockquote/Code available), then the named styles (Title, Subtitle,
Body, Emphasis, Code) from the existing `StylesMenu` fetch. Add the **Subtitle** entry to
`DEFAULT_STYLES` (data). Keep the `activeBlockType` derivation (258-268) so the control
reflects the cursor's block. Rename the display label (465) "Block" → "Styles".

**Accept:** one "Styles" dropdown lists **Normal text · Title · Subtitle · Heading 1–6**
(+ Body/Emphasis/Code/Blockquote) — Normal text/H1–6 are block types, Title/Subtitle are
named styles, all in one control; selecting any applies it; the active state reflects the
cursor's block; no "Block" label remains. **Proves it:** surface **#2** baseline shows
one dropdown; live-apply Normal-text, H1, Title, and Subtitle (the new named style).

**Steps:**
1. RED: surface #2 with the two adjacent dropdowns.
2. Add the `Subtitle` named-style entry to `DEFAULT_STYLES` (data).
3. Build the merged control + single onChange; relabel paragraph→"Normal text";
   preserve `activeBlockType`.
4. Live-verify block types (Normal text/H1) + named styles (Title/Subtitle) apply; an
   empty workspace-styles fetch still shows the block types + the `DEFAULT_STYLES`.
5. Update #2 baseline.

---

### F5 — Edit menu: add Cut/Copy/Paste/Paste-without-formatting

**Files:** `src/components/editor/MenuBar.tsx:89-107` (the `editMenu` config).

**Current → Target:**
- Current (code): the Edit menu is **NOT empty** — it has Undo (90-95), Redo (96-101),
  Select all (103), Find (105), Find and replace (106), all wired to real handlers.
  The user's "Edit opens nothing" is **either a stale-deploy (v0.1.0) artifact or a
  render bug** — reproduce-first. It is **missing** Cut / Copy / Paste / Paste-without-
  formatting.
- Target: Edit menu = Undo · Redo · ─ · Cut · Copy · Paste · Paste without formatting ·
  ─ · Select all · ─ · Find · Find and replace.

**Change (DECIDED — small new clipboard logic, all four ship as real rows; NOT pure
wiring):** Cut/Copy/Paste via the clipboard — `document.execCommand('cut'|'copy'|'paste')`
in the focused contenteditable, with the async Clipboard API + focus guard as the
fallback. **Paste-without-formatting ships as a real strip-marks handler** (not a
placeholder): read `navigator.clipboard.readText()` and
`editor.chain().focus().insertContent(plainText).run()` so marks/styles are dropped (the
ProseMirror selection is replaced with plain text). Reuse the same `Menu` component the
other menus use (so it can't "open nothing"). This is **small new logic**, reclassified
from "wiring" in coverage-matrix — honestly flagged, but it lands fully (no placeholder).

**Accept:** Edit opens a dropdown with all rows; Cut/Copy/Paste act on the selection;
**paste-without-formatting inserts plain text with all formatting stripped** (verified by
copying a bold/coloured run elsewhere and pasting it unformatted); the "opens nothing"
symptom does not reproduce on the fresh build. **Proves it:** surface **#3 (Edit menu
open)** baseline (light + dark); axe + keyboard walk; a live unformatted-paste check.

**Steps:**
1. **Reproduce-first:** fresh build, click Edit — confirm it opens with the existing
   5 rows (if it truly opens nothing, fix the render bug first).
2. Add Cut/Copy/Paste rows → clipboard; add paste-without-formatting → the strip-marks
   handler (`insertContent(plainText)`).
3. Live-verify each row on a selection (incl. an unformatted-paste of a styled run);
   keyboard-walk (↑↓/Esc/focus-restore).
4. Capture surface #3 baseline + axe.

---

### F6 — Parchment-styled 404

**Files:** **NEW** `src/app/not-found.tsx`; `src/app/api/search/route.ts:22-70`
(existing authed search). No `not-found.tsx` exists today (bare Next default).

**Current → Target:**
- Current: the default Next 404 (black "404 | This page could not be found.").
- Target: a Parchment page — large "404" + "This page wandered off" + a **Back to
  home** button (`href="/files"`, `--primary` styled) + a **recovery search input**
  that queries `/api/search?q=` and links results to their docs. Match the Cairn 404
  pattern.

**Change:** **new component, token-styled, no hardcoded hex.** The recovery search
hits the **existing** `/api/search` (already resilient). **`/api/search` is
authenticated** — on a 404 reached while unauthed it returns 401, so the input must be
**conditionally hidden / show a sign-in hint when unauthed** (don't render a dead
search box). Keyword mode, title + preview results.

**Accept:** navigating to a nonexistent route renders the Parchment 404 (not the Next
default); Back-to-home → `/files`; the recovery search returns live results when
authed and is hidden/explained when not; all colors are `var()` tokens.
**Proves it:** surface **#8 (404)** baseline (light + dark); grep the file for hex
literals (must be zero); axe clean.

**Steps:**
1. Build `not-found.tsx` with token styles + Back-to-home + recovery search.
2. Gate the search input on auth; wire to `/api/search`.
3. Live-verify a bogus route (authed + unauthed); capture #8 baseline (light+dark);
   grep for hex.

---

### F7 — Settings ghosted sub-pages: ship-or-hide ⚠ PARTIAL-risk

**Files:** `src/app/(app)/settings/_nav.tsx:6-15` (nav items); the sub-pages
(`workspace/page.tsx`, `admin/page.tsx` + `admin/health/page.tsx`, `developer/page.tsx`,
`notifications/page.tsx`, `security/page.tsx`); `whats-new/page.tsx` (the About target);
`src/lib/version.ts:3` + `src/lib/help/content.ts:39-51` (version/release notes);
`src/app/api/health/route.ts` (Health data). **No `/api/settings/workspace` exists.**

**Current → Target:**
- Current: all sub-pages render content, but several inputs are **bare/uncontrolled
  stubs** — the Workspace name/page-size/files-root inputs have no onChange and **no
  backing endpoint**, and Developer's PAT-create UI is a stub. They look broken.
- Target: **no half-built state.** Either ship the next batch with real persistence or
  disable-with-label.

**Change (grounded decision):**
- **Ship (real backings exist):** **Admin → Health** already consumes `/api/health`
  via `probeAll()` — verify it renders the pills cleanly. **About** = `/whats-new`,
  already wired to `RELEASE_NOTES` + `APP_VERSION` — verify version/license/GitHub
  link present (bump `version.ts` to `0.1.2` at release).
- **PARTIAL-risk — Workspace → General:** the workspace-name field has **no
  `/api/settings/workspace` endpoint.** Decision: either add a minimal
  GET/PUT `/api/settings/workspace` route (small new backend — name only) **or**
  render the field `disabled` + "Coming in v0.2". Pick one at implementation; if
  disabled, log `F7 PARTIAL` naming the workspace-persistence gap.
- **Hide** any remaining stub inputs that won't ship (e.g. Developer PAT-create) until
  they have a backing — no dim "coming soon" inputs left visible.

**Accept:** every visible Settings control either works or is clearly disabled-with-
reason; Admin → Health shows live pills; About shows version + license + GitHub. No
ghosted/dim sub-page reads as broken. **Proves it:** **surface #7 (settings → Account)**
is the gated visual-regression baseline (light + dark); the **other three settings pages
touched (Workspace · Admin→Health · About) are captured as per-PR live-deploy artifacts**
(light + dark) but are NOT added to the 9-surface regression gate — F1 owns the Account
theme control on #7, F7 owns the rest as live shots. axe clean on each.

**Steps:**
1. Audit each sub-page; list every uncontrolled input.
2. Verify Admin→Health + About render real data.
3. Decide Workspace-name: ship endpoint OR disable+label (log PARTIAL if disabled).
4. Hide remaining unbacked stub inputs.
5. Live-verify; capture baselines.

---

### F8 — Bottom status bar restored + pinned

**Files:** `src/components/editor/StatusBar.tsx:1-89` (full, already implemented);
`src/components/editor/Editor.tsx:1575-1584` (rendered, wired); `globals.css:914-984`
(`.parchment-status-bar`). **Pairs with L3.**

**Current → Target:**
- Current (code): `StatusBar` **is already rendered + fully wired** — left "Page N of
  N", center word-count (opens the Word-count modal), right reading-count + connection
  dot, 24px white bar with `--border-chrome` top border. It is **in normal flow**
  inside the centered column, **not pinned** to the viewport bottom. The user's "v0.1.1
  dropped it" is a **stale-deploy (v0.1.0) artifact** (v0.1.0 had a different status
  line; v0.1.1's `StatusBar` is present).
- Target: pin it **full-width to the bottom** of the editor route, 24px, white (light)
  / #202124-ish (dark), 1px top border, content centered (L3).

**Change:** **layout-only — no count logic.** `position:fixed; bottom:0; left/right`
(full-bleed bg) with the content in the centered max-width container (L3); reserve
`padding-bottom:24px` on the scroll container so document content isn't hidden under
the bar. Counts/connection/word-count-modal wiring is unchanged.

**Accept:** a slim 24px status bar pinned at the viewport bottom, full-width, content
centered; page/word-count/mode/connection visible; word-count click opens the modal;
nothing hidden behind it on a long doc. **Proves it:** surface **#5 (status bar
pinned)** baseline (light + dark); scroll a long doc — bottom content not clipped.

**Steps:**
1. **Reproduce-first:** confirm `StatusBar` renders on the fresh build (it does).
2. Pin it (`position:fixed`, full-bleed bg, centered content); reserve bottom padding.
3. Live-verify long-doc scroll + word-count modal in light + dark.
4. Capture #5 baseline.

---

### F9 — Share dialog completeness ⚠ PARTIAL-risk (per-email needs new API+schema)

**Files:** `src/components/editor/ShareDialog.tsx:1-270`;
`src/app/api/docs/[id]/shares/route.ts:1-83` (POST creates a token share, returns
`{id,token,url}`); `globals.css` `.parchment-share-*` / `.parchment-dialog-*`.

**Current → Target (grounded):**
- Current: a token-link model — a permission `<select>` ("Anyone with the link" → Can
  view/comment/edit/suggest), password, expiry, a **"Create link"** primary button, an
  existing-links list with per-link Copy/Revoke (copy + toast already implemented), and
  a **disabled email-invite stub** labelled v0.2.
- Target (the in-scope, no-new-backend parts):
  - **Auto-generate the link when the dialog opens**; primary button becomes **"Copy
    link"** (copies + toast — the copy handler already exists, reuse it on the
    just-created token).
  - A **"Restricted" vs "Anyone with the link"** toggle above the role dropdown.
  - Keep the **"Invite by email (v0.2)"** placeholder.
- PARTIAL-risk parts (new feature logic — out of "no new features"):
  - **"Add people, groups, calendar events"** per-email input + per-email role grants
    need a **new API route + a per-email grants table + access-control in the viewer.**
  - The **Restricted toggle** semantics need a `mode`/`public` field on the shares
    schema to truly enforce "restricted".

**Change:** ship the **link-side UX** (auto-link on open, "Copy link" primary, the
Restricted/Anyone toggle as a **UI** control). If enforcing "Restricted" needs a schema
field, scope that enforcement as the **named PARTIAL gap** (the toggle can ship as UI
with the enforcement noted) and keep per-email as the honest placeholder. Do **not**
ship a per-email "Add" button that 404s — it stays disabled/"v0.2".

**Accept:** opening Share shows a ready-to-copy link + a "Copy link" primary (toast on
copy) + a Restricted/Anyone toggle; the per-email section is a clear v0.2 placeholder;
no dead buttons. If Restricted enforcement isn't wired, that's logged as the named
PARTIAL gap. **Proves it:** surface **#6 (share dialog)** baseline (light + dark);
live copy → clipboard contains the real `url` from the POST response (origin-correct).

**Steps:**
1. RED: surface #6 with "Create link" + disabled email stub.
2. Auto-create the link on open; relabel primary "Copy link"; reuse the copy+toast.
3. Add the Restricted/Anyone toggle (UI; enforcement = schema decision → ship or log).
4. Keep per-email disabled "v0.2".
5. Live-verify copy origin-correctness; update #6 baseline; log F9 PARTIAL if
   Restricted-enforcement or per-email remains placeholdered.

---

### F10 — Audit "Coming soon" menu rows — ship 3, hide the rest (incl. Page number)

**Files:** `src/components/editor/MenuBar.tsx` (placeholders at 81-86, 112-115, 143-145,
178-179, 188-190, 193, 202-204; `placeholder()` helper at 35-37); the insert menu
around 140-142; `src/lib/editor/extensions/slash-menu.ts:93` (`setHorizontalRule`);
`HelpMenu.tsx:215` (Keyboard-shortcuts dialog).

**Reconciliation with the user's "ship the four named" (grounded):** the user named
**4** trivial rows to ship — Insert→Page number, Insert→Horizontal line, Format→Clear
formatting, Help→Keyboard shortcuts. Grounding shows only **3** are actually shippable;
**Page number is NOT trivial** — page numbers are attributes on `sectionBreak` nodes set
via the section-break dialog, there is **no standalone "insert page number" command**, so
shipping it would be genuinely new feature logic (out of scope). Per the user's own rule
("hide for any that won't fit"), **Page number is hidden**, not shipped. Net: **ship 3,
hide the rest.**

**Current → Target (grounded):**
- Ship (backing exists):
  - **Insert → Horizontal line** — `setHorizontalRule()` exists; **add** the row
    (missing today) between Page break and the separator.
  - **Help → Keyboard shortcuts** — a backing dialog exists in `HelpMenu`; **wire** the
    placeholder row to open it.
- Already wired (no change): **Format → Clear formatting** (`unsetAllMarks().clearNodes()`
  at 173-176) — confirm live.
- **Insert → Page number** — **no backing** (page numbers are section-break attrs, not a
  standalone insert; new logic, out of scope). → **HIDE** (the user's "trivial" was
  wrong; do not ship a Page-number insert in v0.1.2).
- **Hide** the remaining placeholder rows that won't ship in v0.1.2 (File New/Open/Copy/
  Move/Trash/Email; View Print-layout/Pageless/Ruler/Full-screen; Insert Chart/Special-
  chars/Headers-footers; Format Columns/Page-numbers; Tools Spell-check/Dictionary/
  Translate; all Extensions; Help Replay-tour/About-as-row) — **no visible dead "coming
  soon" rows.**

**Change:** **wiring + deletion.** Add 1 row (Horizontal line), wire 1 (Shortcuts),
delete/hide the unbacked placeholders. No new feature logic.

**Accept:** every visible menu row fires a real action; Insert→Horizontal line inserts
an `<hr>`; Help→Keyboard shortcuts opens the modal; no "coming soon" rows remain
visible (hidden, not dimmed). **Proves it:** live click-through of every remaining row;
surface **#3 (a menu open)** baseline updated; axe + keyboard walk.

**Steps:**
1. Enumerate every current placeholder row (grounded list above).
2. Add Horizontal line; wire Keyboard shortcuts; confirm Clear formatting.
3. Hide the unbacked rows (remove from config).
4. Live click-through; update baselines; axe.

---

## Coverage check
- **Audit gaps mapped to real code:** dead Account theme select with no onChange
  (F1, `account/page.tsx:56`); prose color already `--foreground` — reported grey is
  likely stale-deploy (F2, `globals.css:2079`); 7/8 toolbar controls present, highlight-
  color + insert-comment genuinely missing (F3); two adjacent Block+Styles dropdowns
  (F4, `Toolbar.tsx:464-487`); Edit menu populated but missing clipboard rows (F5,
  `MenuBar.tsx:89-107`); no `not-found.tsx` (F6); settings sub-pages render but with
  unbacked inputs (F7); `StatusBar` present but unpinned (F8, `Editor.tsx:1577`); share
  dialog is token-link-only, per-email is a v0.2 stub (F9); placeholder menu rows, two
  with real backings (F10).
- **Cross-item:** F8 pinning is the same work as **L3** (full-width status bar) — do
  them together. F3's font/icon faces + the Material toolbar glyphs are inherited from
  v0.1.1 S1-8/S4-3 (no re-load). F1's `router.refresh()` is the same cascade
  `AppearanceSettings` already uses. F6/F9/F7 token-style via the v0.1.1
  `.parchment-dialog`/page tokens.
- **No new feature logic except (named, PARTIAL-scoped):** F3 highlight-color + insert-
  comment, F7 workspace-name persistence, F9 per-email grants + Restricted enforcement.
  Everything else is wiring, restyle, deletion, or a new token-styled view over existing
  endpoints.

## Newly-discovered gaps / scoping flags
- **Stale-deploy reconciliation (F2/F5/F8/F10/C2):** the sweep's "dropped/empty/grey/
  dim" reports do not match the v0.1.1 code. Each carries a reproduce-first Step 1; a
  v0.1.1 **redeploy to the homelab is a release prerequisite** so live artifacts are
  trustworthy (see coverage-matrix).
- **F3 highlight-color** needs a Tiptap highlight color attr (`setHighlightColor` does
  not exist) — genuinely new; PARTIAL-risk.
- **F3 insert-comment** may collide with the D1 thread-sidebar comment model — evaluate
  reusing the D1 create flow; PARTIAL-risk.
- **F7 Workspace persistence** has no `/api/settings/workspace` endpoint — ship a minimal
  route or disable+label; PARTIAL-risk.
- **F9 per-email + Restricted enforcement** need a new route + schema field — out of "no
  new features"; ship the link UX, name the gap.
- **Paste-without-formatting (F5)** has no native backing — small strip handler or honest
  placeholder.

## Failure-modes-verified
- **Theme toggle no-ops (F1):** click Light from a dark browser → assert a `PUT
  /api/settings/theme` fires AND the chrome re-themes without reload (the
  `router.refresh()` is the load-bearing bit); reload → persisted.
- **Page ink false-fix (F2):** do NOT re-assert `--foreground` blindly — trace the
  computed color to its source; if grey doesn't reproduce on the fresh build it's stale-
  deploy (close as verified), else fix the real overriding rule and re-check HC-dark
  (#FFFFFF) + dyslexic-font.
- **Toolbar control fakery (F3):** every shipped control applies to the live selection
  (not just renders); font-size −/+ preserves unit + bounds; highlight-color persists
  across spans or is an honest disabled placeholder (logged), never a no-op swatch.
- **Merged-dropdown regressions (F4):** block types + named styles both apply; empty
  styles list still shows blocks; active state tracks the cursor block.
- **Edit menu "opens nothing" (F5):** reproduce-first — it opens with 5 rows in code; if
  it truly renders empty, fix the render bug before adding rows; clipboard rows act on
  the selection; paste-without-formatting strips or is labelled.
- **404 dead search (F6):** the recovery input is hidden/explained when unauthed (the
  search route is authed); no hardcoded hex (grep); Back-to-home → /files.
- **Half-built settings (F7):** no visible input that types-but-never-saves — each is
  wired or disabled-with-reason; Health pills + About version render real data.
- **Status bar hides content (F8/L3):** pinning reserves `padding-bottom`; a long doc's
  last line is not clipped; word-count modal still opens.
- **Share dead buttons (F9):** no per-email "Add" that 404s; the copied link is the
  origin-correct `url` from the POST response; Restricted enforcement is wired or named
  as the PARTIAL gap.
- **Menu placeholder honesty (F10):** every visible row fires a real action; unbacked
  rows are **hidden**, not dimmed; Horizontal line inserts `<hr>`, Shortcuts opens the
  modal.
- **Light AND dark (all F items):** every surface is captured + axe-clean in BOTH
  schemes — F1 makes the toggle reliable so this is verifiable.
