# Plan S4 — Typography + spacing

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ⛔  HOLD — SCAFFOLD/PLAN ONLY. NO IMPLEMENTATION.                         ║
║                                                                            ║
║  Runs AFTER S1 (tokens), S2 (chrome), S3 (editor chrome). Do NOT branch,   ║
║  write code, or open a PR until the user replies "GO" on Plan S1 and S1–S3 ║
║  have merged. S4 consumes S1 color tokens and styles the S3-1 title bar /  ║
║  S3-2 menu bar / S3-3 toolbar — those components must exist first.         ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Intent:** match Google Docs typography — Google Sans / Roboto chrome, Arial body,
a pt-based type ramp on the rendered content — and a consistent spacing grid.
Drop Inter. The **markdown serializer must round-trip unchanged** (S4-2 is CSS
classes on the rendered ProseMirror output, **not** a doc-model change).

**Hard rule (post-S1):** never hard-code a color after S1. Every color in S4 is a
token. S4 owns **size / weight / family / spacing only**; all hex comes from S1's
`src/styles/tokens.css`. The two content-ink colors this plan references —
`#202124` (body/heading ink) and `#5F6368` (subtitle/muted ink) — are the
**existing S1 tokens `--foreground` and `--muted`** (see the canonical vocabulary
in plan-S1.md). **S4 references `var(--foreground)` / `var(--muted)` — it does NOT
use `--ink` / `--ink-muted` (those names do not exist).** (Closes findings #2, the
S4-2 cross-plan blocker.)

> **Font-loading split (DECIDED — finding #17):** the @font-face / Material Symbols
> **face loading** moved to **S1-8** (so S2/S3 don't render tofu before S4). **S4
> still owns the type RAMP + sizing + weight + Arial body + dropping Inter** — it
> sizes/weights faces that S1 already loaded; it no longer ships woff2 or
> `@font-face` blocks. The `public/fonts/` + `package.json` rows below are now
> S1-8's; S4 only references `--font-ui`/`--font-body`/`--font-mono` (minted in
> S1-8) and the `material-symbols-rounded` class (loaded by S1-8).

**Files this plan touches (verified against the map):**
- `src/styles/tokens.css` — **created by S1**; the **`--font-*` block is minted by
  S1-8** (faces + defaults). S4 *appends* only a **spacing-token block**
  (`--space-1…--space-14`, row/icon-button sizes) in S4-4. No `tailwind.config.*`
  exists (Tailwind 4.3, CSS-config) — there is nothing to edit there; the "tailwind
  font extend" in the old scaffold does not exist as a file, so "remove Inter from
  the extend" reduces to removing the `inter` FontPair in `theme.ts`.
- `src/app/globals.css` — `:root`/scheme font-var defaults (lines 25–27, 167–168),
  the `.parchment-prose` type ramp (lines 1435–1483), chrome class font-sizes
  (toolbar `0.85rem` L484, dialog, outline, status bar), `--page-pad` (L29). **No
  `@page` block exists in this file** — see S4-4.
- `src/lib/editor/theme.ts` — `FONT_PAIRS` (lines 47–58): drop the `inter` pair;
  reorder so **Arial** is the default body face; update `SYSTEM_SANS`/`SYSTEM_MONO`
  to the Google stack used by the chrome.
- `src/components/editor/Editor.tsx` — doc-title `<h1>` at **line 1424**
  (`className="mb-4 font-semibold text-2xl tracking-tight"`) → swap to the Title
  ramp class. (If S3-1 has already moved the title into a `DocTitleBar` component,
  re-point this edit there.)
- `src/lib/export/page-css.ts` — `@page` rule builder (`DEFAULT_RULE`,
  `NAMED_DIMS`, px→in). This is where "@page 1in default / A4 2.54cm" already lives.
- `src/lib/editor/paginate.ts` — `PageSetup.margins` defaults (px @ 96 dpi) — the
  on-screen page padding that mirrors the print margin.
- `public/fonts/` — **OWNED BY S1-8 now** (face loading moved out of S4 per finding
  #17). The self-hosted woff2 (Roboto 400/500/700, Roboto Mono 400, Material
  Symbols Rounded) + licenses land in S1-8. S4 assumes the faces resolve.
- `package.json` — `@material-symbols/svg-400` is **added by S1-8**, not S4. S4-3's
  `<Icon>` wrapper consumes it.

---

### S4-1 — Font stack (RAMP-side: drop Inter, Arial body, retarget theme.ts)
**Files:** `src/styles/tokens.css` (the `--font-*` token defaults are minted by
S1-8; S4-1 only *uses* them / retunes the exact stacks if needed),
`src/app/globals.css` (lines 25–27 `--font-body`/`--font-heading` defaults; `body`
rule L193 already reads `var(--font-body)`), `src/lib/editor/theme.ts`
(`SYSTEM_SANS` L41–42, `SYSTEM_MONO` L44, `FONT_PAIRS` L47–58).

> **Face loading is S1-8** (finding #17) — S4-1 does NOT add woff2 or `@font-face`
> blocks. It does the **theme/ramp** half: drop the `inter` FontPair, make Arial
> the document-body default, retarget `SYSTEM_SANS`/`SYSTEM_MONO`, and swap the
> three hard-coded mono stacks to `var(--font-mono)`.

**Current → Target**
- UI / chrome font: current `--font-body` = `ui-sans-serif, system-ui,
  -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (globals L25–26
  and `SYSTEM_SANS` theme.ts L41) → **`"Google Sans","Roboto",system-ui,
  -apple-system,BlinkMacSystemFont,sans-serif`**.
- Body (document) font: current = same system sans (no Arial-first) → **`Arial,
  sans-serif`** (Docs default).
- Mono / code: current `SYSTEM_MONO` = `ui-monospace, SFMono-Regular, Menlo,
  Consolas, monospace` (theme.ts L44; also hard-coded in globals at `.parchment-prose
  code` L621, `pre` L1494, `.parchment-cb-pre` L1636, `.parchment-cb-header` L1538)
  → **`"Roboto Mono","Menlo",monospace`**.
- `FONT_PAIRS`: current has 5 pairs incl. **`inter`** (L50) → drop `inter`; pairs
  become `system` (Google/Roboto), `serif`, `mono` (Roboto Mono), `classic`. Make
  the document/body default **Arial** (Docs lists Arial first in the S3-3 font
  dropdown).

**Change**
- The `--font-ui` / `--font-body` (Arial) / `--font-mono` token block + the
  `@font-face` faces are **minted by S1-8**. S4-1 assumes they resolve.
- `globals.css` L25–27: replace the `--font-body` literal with `var(--font-ui)` for
  chrome; the **document** body face is applied on `.parchment-prose` (S4-2), not on
  `body`, so chrome and document can diverge (chrome = Roboto, body = Arial).
- `theme.ts`: set `SYSTEM_SANS = '"Google Sans","Roboto",system-ui,-apple-system,
  BlinkMacSystemFont,sans-serif'`, `SYSTEM_MONO = '"Roboto Mono","Menlo",monospace'`;
  **delete the `inter` entry** (L50); the `system` pair body becomes Arial.
- Replace the three hard-coded `ui-monospace,…` font stacks in globals (L621, 1494,
  1538, 1636) with `var(--font-mono)`.

**No new logic** — pure token/theme swap; `themeCssVars()` already emits
`--font-body`/`--font-heading` and needs only the new default values. (Faces
already loaded by S1-8.)

**Accept:** computed UI font = Google Sans → Roboto fallback; document body =
Arial; code = Roboto Mono; `grep -ri "inter" src/` returns **zero** font references
(only `Interval`/`interaction` non-font hits remain — see Failure-modes). Network
panel on the deploy shows **no external font fetch** (Roboto/Roboto Mono served from
`/fonts/`). **Proves it:** axe (no contrast regression) + visual-regression surfaces
**#4 editor idle**, **#7 settings→theme** (font-pair list no longer shows Inter).

**Steps** (faces are loaded by S1-8 — S4-1 is theme/ramp only)
1. Confirm S1-8 has shipped the faces + `--font-*` defaults (dependency gate).
2. `globals.css`: chrome containers read `var(--font-ui)`; document body reads
   `var(--font-body)` on `.parchment-prose`.
3. Edit `theme.ts` (drop `inter`, retarget `SYSTEM_SANS`/`SYSTEM_MONO`, Arial body)
   — **TDD**: there is a pure unit (`parseTheme`/`FONT_PAIRS`); add/adjust a test
   asserting `FONT_PAIRS` has no `inter` key and the `mono` pair body contains
   `Roboto Mono`. RED first.
4. Swap the hard-coded mono stacks in globals to `var(--font-mono)`.
5. Snapshot baselines for #4/#7 (RED on main), implement, re-snapshot (GREEN),
   live-verify computed styles + network panel on the branch deploy (faces served
   from `/fonts/` by S1-8).

### S4-2 — Type ramp (page content)
**Files:** `src/app/globals.css` `.parchment-prose` ramp (lines 1435–1483 — `h1`
1449, `h2` 1454, `h3` 1459, `p` 1464, `ul/ol` 1467; **no Title/Subtitle/H4–H6
rules exist today**), `src/components/editor/Editor.tsx` doc-title `<h1>` **L1424**.

**Current → Target** (sizes in pt per the audit; CSS authored in pt directly so the
spec value *is* the rule — avoids the px-rounding failure mode):

| Element | Current | Target |
|---|---|---|
| Doc **Title** | `<h1>` Tailwind `font-semibold text-2xl tracking-tight` (≈24px/600) at Editor.tsx L1424 | **26pt Arial bold**, color `var(--foreground)` (#202124), margin `12px 0 8px` |
| **Subtitle** | *(none)* | **16pt Arial regular**, color `var(--muted)` (#5F6368) |
| Prose **H1** | `1.75rem`/28px, `600`, margin `1.2em 0 0.4em` (L1449–1453) | **20pt bold**, margin `20px 0 6px` |
| Prose **H2** | `1.4rem`/22.4px, `600`, margin `1.1em 0 0.4em` (L1454–1458) | **16pt bold**, margin `18px 0 6px` |
| Prose **H3** | `1.2rem`/19.2px, `600`, margin `1em 0 0.3em` (L1459–1463) | **14pt bold**, margin `16px 0 4px` |
| Prose **H4–H6** | *(no rules — inherit browser default)* | **12pt**, H4 bold / H5 italic / H6 regular |
| **Body** (`p`, base) | `.parchment-prose` line-height `1.6` (L1438); `p` margin `0.5em` (L1464) | **11pt Arial, line-height 1.15**, color `var(--foreground)` |

**Change** — extend the existing `.parchment-prose` block (do **not** add a doc-model
node; this is presentation CSS on the already-rendered ProseMirror tree):
```css
.parchment-prose { font-family: var(--font-body); font-size: 11pt;
  line-height: 1.15; color: var(--foreground); }       /* was line-height:1.6 */
.parchment-prose h1 { font-size: 20pt; font-weight: 700; margin: 20px 0 6px; }
.parchment-prose h2 { font-size: 16pt; font-weight: 700; margin: 18px 0 6px; }
.parchment-prose h3 { font-size: 14pt; font-weight: 700; margin: 16px 0 4px; }
.parchment-prose h4 { font-size: 12pt; font-weight: 700; }
.parchment-prose h5 { font-size: 12pt; font-style: italic; font-weight: 400; }
.parchment-prose h6 { font-size: 12pt; font-weight: 400; }
```
Title/Subtitle are **chrome**, not prose — add classes used by the title `<h1>`
(color is still the canonical ink token, only size/weight differ):
```css
.parchment-doc-title    { font: 700 26pt/1.2 var(--font-body); color: var(--foreground);
                          margin: 12px 0 8px; letter-spacing: -0.01em; }
.parchment-doc-subtitle { font: 400 16pt var(--font-body); color: var(--muted); }
```
Editor.tsx **L1424**: replace `className="mb-4 font-semibold text-2xl tracking-tight"`
with `className="parchment-doc-title"`. (If S3-1 already extracted a `DocTitleBar`,
apply the class there instead and leave L1424 removed.)

**No new logic.** The doc Title/Subtitle are existing surfaces re-skinned; H4–H6
already exist as marks in the schema (Heading levels 1–6 from StarterKit) — we are
only adding the CSS that was missing.

**Accept:** rendered doc matches the ramp at the exact pt sizes (DevTools computed
`font-size` = `26.6px` for 20pt, `21.3px` for 16pt, etc.; 1pt = 1.3333px). The
**export round-trip** `serialize(parse(serialize(doc)))` is **byte-identical** to
pre-S4 output (the ramp is presentation only — proven by the round-trip test under
Failure-modes). **Proves it:** visual-regression surface **#4 editor idle** (whole
ramp visible in a fixture doc with Title + H1–H6 + body); axe (heading-order + body
contrast `var(--foreground)` on white ≥ 4.5:1).

**Steps**
1. Add a fixture doc containing Title, Subtitle, H1–H6, body to the #4 snapshot
   harness; capture RED baseline on main.
2. **TDD (pure logic exists):** before any CSS, run the existing markdown
   round-trip test and capture the **pre-S4 golden** serialization bytes; assert
   equality persists after S4 (this is the regression guard, not a new feature).
3. Implement the `.parchment-prose` ramp + `.parchment-doc-title/subtitle` CSS;
   re-point Editor.tsx L1424.
4. Re-snapshot (GREEN), run axe, live-verify computed pt sizes on the deploy.

### S4-3 — Toolbar / chrome typography (sizing only; icon font loaded by S1-8)
**Files:** `src/app/globals.css` (`.parchment-toolbar-btn` font-size L484 `0.85rem`;
`.parchment-toolbar-label` L515 `0.78rem`; `.parchment-toolbar-select` L523;
dialog/outline/status font-sizes), the **S3-1 `DocTitleBar`** + **S3-2 `MenuBar`** +
**S3-3 `Toolbar`** components (created in S3 — S4-3 only sets their type + icon
size). The Material Symbols **font + `@material-symbols/svg-400`** are loaded by
**S1-8** (finding #17); S4-3 only sizes the glyph (20px) + builds the `<Icon>`
wrapper that consumes the already-installed SVG source.

**Current → Target**
- Menu-bar items: **component does not exist yet** — built by **S3-2** (which the
  scope flags as a *PARTIAL-risk shared-dropdown system*). S4-3 sets its text to
  **14px Roboto regular** *once it lands*. If S3-2 ships PARTIAL, S4-3 styles only
  the menu-bar surface that shipped and is marked PARTIAL to match (see Coverage).
- Toolbar dropdown / button text: current `0.85rem` (≈13.6px) on
  `.parchment-toolbar-btn` (globals L484), `0.78rem` label (L515), `0.8rem` select
  (L523) → **14px Roboto regular** across the toolbar row.
- Icons: current = **plain SVG/emoji, no icon library** (map gap: "no Material
  Design Icons setup") → **20px Material Symbols Rounded**, weight 400, served from
  the self-hosted `@material-symbols/svg-400` SVGs (no CDN) — **the package + font
  are installed by S1-8**; S4-3 builds the `<Icon>` wrapper + sizes the glyph.

**Change**
- `globals.css`: set toolbar/menu/chrome control text to `font: 400 14px/1
  var(--font-ui)` — update `.parchment-toolbar-btn` (L484 `0.85rem`→`14px`),
  `.parchment-toolbar-label` (L515), `.parchment-toolbar-select` (L523); add a
  `.parchment-menu-item { font: 400 14px var(--font-ui); }` for the S3-2 menu rows.
- Icons: introduce a tiny `<Icon name=… size=20 />` wrapper (presentation only — no
  behavior) that inlines the Material Symbols Rounded SVG from
  `@material-symbols/svg-400`; default render box **20×20**. This is the single icon
  source S2 nav rows and S3 toolbar/menu consume (cross-plan note below).
- Color stays a token (`var(--foreground)` / `var(--primary)` from S1) — S4-3 sets
  only `font`/`size`.

**Scope note (carried from S3-2):** the **menu bar itself is new component work
owned by S3-2**, not S4. S4-3 must not build it — it only applies the 14px-Roboto
type + 20px icon to whatever S3-2 delivered. If S3-2 is PARTIAL at S4 time, S4-3 is
PARTIAL by inheritance; log the percent in scope.md, do not claim DONE.

**Accept:** computed chrome text = **14px**, family resolves to Roboto; every
toolbar/menu icon renders a **Material Symbols glyph at 20×20** (no tofu/blank).
**Proves it:** visual-regression surface **#5 editor with toolbar overflow (⋯) open**
(every icon + 14px label visible) and **#4 editor idle**; axe on the toolbar (icon
buttons have accessible names — names come from S3/S5-2 tooltips, contrast on icon
ink).

**Steps** (`@material-symbols/svg-400` + Material Symbols font installed by S1-8)
1. Confirm S1-8 shipped the icon package + Material Symbols face (dependency gate);
   baseline-snapshot #5 (RED — current emoji/SVG icons + 0.85rem text).
2. Build the `<Icon>` wrapper (pure presentational; **TDD** a render test: given a
   name it emits a 20×20 `<svg>` with that symbol's path from the installed package).
3. Apply 14px Roboto to toolbar/menu CSS; swap toolbar icons to `<Icon>`.
4. Re-snapshot #4/#5 (GREEN), axe, live-verify glyphs + computed 14px on the deploy.

### S4-4 — Spacing tokens
**Files:** `src/styles/tokens.css` (new spacing-token block, S1 file),
`src/app/globals.css` (`--page-pad` L29 `96px`; sidebar row + toolbar-btn sizing —
note sidebar nav is **inline Tailwind** in `src/app/(app)/layout.tsx` L65–74, not a
CSS class), `src/app/(app)/layout.tsx` (nav row `py-1.5` → 36px row),
`src/lib/export/page-css.ts` (`DEFAULT_RULE` L13, `NAMED_DIMS` A4),
`src/lib/editor/paginate.ts` (`PageSetup.margins` defaults).

**Current → Target**
- Spacing scale: current = **ad-hoc** (mix of Tailwind `gap-2`, raw `4px 8px`,
  `1.2em`, `0.5em` throughout) → a **token grid 4/8/12/16/20/24/32/40/56**
  (`--space-1 … --space-14`).
- Sidebar nav row: current `px-2 py-1.5 text-sm` (layout.tsx L70–72; no fixed
  height, ≈30px) → **36px row height**.
- Toolbar icon button: current `min-width:28px; height:28px` with `font-size:0.85rem`
  icon (`.parchment-toolbar-btn` globals L481–484) → **32×32 with a 20px icon**
  (pairs with S4-3).
- Page canvas margin: `--page-pad` = `96px` (= 1in @ 96dpi) and `DEFAULT_RULE`
  already = `@page { size: 8.5in 11in; margin: 1in 1in 1in 1in; }` (page-css.ts L13).
  **Target: keep 1in default; ensure the A4 toggle (Page setup) maps to 2.54cm.**
  `NAMED_DIMS.A4` (page-css.ts L7) is `210mm × 297mm`; the margin is built from
  `PageSetup.margins` px (96/in = 2.54cm). **There is no `@page` block in
  globals.css** — S4-4 does *not* add one; it confirms/normalizes the existing
  `page-css.ts` builder and the `--page-pad` on-screen mirror.

**Change**
- Append to `src/styles/tokens.css`:
  ```css
  :root {
    --space-1:4px;  --space-2:8px;  --space-3:12px; --space-4:16px;
    --space-5:20px; --space-6:24px; --space-8:32px; --space-10:40px;
    --space-14:56px;
    --row-h:36px;            /* sidebar / menu rows */
    --icon-btn:32px;         /* toolbar/menu icon button box */
    --icon-size:20px;        /* glyph inside it (S4-3) */
  }
  ```
- `globals.css` `.parchment-toolbar-btn` (L481–484): `min-width:var(--icon-btn);
  height:var(--icon-btn);` (32px) and icon at `var(--icon-size)` (20px).
- `layout.tsx` nav `<Link>` (L70–72): add `h-9` (36px) / `min-h-[var(--row-h)]` and
  vertically center, replacing `py-1.5`.
- `--page-pad` stays `96px` (1in); add a comment tying it to the print
  `DEFAULT_RULE`. Verify `page-css.ts` A4 path: A4 default margins of `96px` →
  `pxToInStr` yields `1in` = 2.54cm; confirm Page-setup A4 preset stores 96px (or
  the explicit `2.54cm`-equiv) so screen `--page-pad` and print `@page` agree.
- Replace the most load-bearing ad-hoc gaps in chrome (toolbar `gap`, dialog
  padding, sidebar gap) with `var(--space-*)` — incremental, not a global sweep
  (a full sweep is out of scope; tokens exist + key surfaces adopt them).

**No new logic** — token plumbing + size constants. The Page-setup A4 path is
**existing behavior** (paginate.ts/page-css.ts) — S4-4 only verifies the mapping,
it does not add a setting.

**Accept:** spacing tokens exist in `tokens.css` and are applied on toolbar buttons
(**computed 32×32**, icon 20px), sidebar rows (**computed 36px**); `pageCss()`
default rule = `margin: 1in` and the A4 preset resolves to `2.54cm` margins (unit
test on `pageCss`). **Proves it:** visual-regression **#2 files page** + **#4 editor
idle** (row heights / icon buttons), and a **unit test** on `pageCss(A4 setup)`
asserting `2.54cm`/`1in` equivalence; axe (target-size — 32px buttons clear the
24×24 minimum).

**Steps**
1. **TDD:** add a `pageCss` unit test — `pageCss({size:'A4',margins:96px})` →
   `@page { size: 210mm 297mm; margin: 1in 1in 1in 1in; }` and assert `1in` ≡
   `2.54cm`; default rule = `margin: 1in`. RED if the A4 margin path is wrong.
2. Append the spacing-token block to `tokens.css`.
3. Apply `--icon-btn`/`--icon-size` to `.parchment-toolbar-btn`; apply `--row-h` to
   the sidebar nav rows in `layout.tsx`.
4. Snapshot #2/#4 (RED→GREEN), run the `pageCss` test, axe target-size, live-verify
   computed sizes on the deploy.

---

## Coverage check
- **Audit gaps closed:** Inter / mismatched fonts → **S4-1** (drop the `inter`
  FontPair in `theme.ts` L50; Google/Roboto UI, Arial body, Roboto Mono code — the
  faces are self-hosted by **S1-8**, S4-1 does the theme/ramp half). No Docs type
  ramp (map gap: "no dedicated typography scale") →
  **S4-2** (`.parchment-prose` ramp + doc Title/Subtitle classes, pt-authored).
  Inconsistent chrome text + non-Material icons (map gap: "no Material Design Icons
  setup") → **S4-3** (14px Roboto, 20px Material Symbols Rounded via
  `@material-symbols/svg-400`). Ad-hoc spacing → **S4-4** (token grid + 36px rows +
  32×32/20px icon buttons; `@page` 1in default / A4 2.54cm confirmed in
  `page-css.ts`).
- **Cross-plan:** S4-3's `<Icon>` (20px Material Symbols) is the **single icon
  source** consumed by S2 nav rows + S3 toolbar/menu (which referenced "20px
  Material"). S4-4 spacing tokens back S2-1 row heights + S3 icon buttons + S5 pills.
  **Colors come from S1** (`--foreground` #202124, `--muted` #5F6368, `--primary`/
  `--accent`); S4 references them and owns size/weight/family/spacing only.
- **Dependency order:** S4-2 re-points the title `<h1>` and S4-3 styles the menu
  bar / toolbar — both assume **S3-1 (`DocTitleBar`)**, **S3-2 (`MenuBar`)**,
  **S3-3 (`Toolbar` restyle)** have merged. If any S3 item is still PARTIAL, the
  dependent S4 sub-item inherits PARTIAL.
- **Out of scope:** color tokens → **S1**; the doc model / markdown format →
  **unchanged** (S4-2 is render-CSS, explicitly verified by the round-trip); a full
  spacing-token sweep of every component → out of scope (tokens defined + key
  surfaces adopt them; remaining ad-hoc gaps tracked, not silently dropped).

### Newly-discovered facts vs. the original scaffold
- **No `tailwind.config.*` and no `src/styles/` directory exist today** (Tailwind
  4.3 is CSS-configured). "Remove Inter from the Tailwind font extend" is a no-op
  against a non-existent file; the real change is dropping the `inter` FontPair in
  `theme.ts` (L50). `src/styles/tokens.css` is **created by S1**, and the
  `--font-*` defaults + `@font-face` faces are **minted by S1-8** (finding #17) — S4
  consumes them and owns only the ramp/sizing/weight.
- **No `@page` block exists in `globals.css`.** The `@page` rule is built in
  `src/lib/export/page-css.ts` (`DEFAULT_RULE` already = `margin: 1in`), so S4-4's
  "@page 1in" is **already true** — the item reduces to a *verification + A4-2.54cm
  unit test*, not a new rule.
- **The doc Title `<h1>` is inline in `Editor.tsx` L1424**, not a component; if
  S3-1 has not yet extracted `DocTitleBar`, S4-2 edits L1424 directly.

### PARTIAL risk (flag, do not over-promise)
- **S4-3 inherits S3-2's menu-bar PARTIAL risk.** The menu bar is **new shared
  component work owned by S3-2**, which the scope already flags as
  "shared dropdown system; PARTIAL risk." S4-3 cannot style a surface S3-2 hasn't
  shipped. **Recommendation:** scope S4-3 to ship *toolbar + title-bar* typography
  first (those S3 surfaces are lower-risk), and mark the **menu-bar typography
  sub-part PARTIAL** with the percent, gated on S3-2 landing. Do not flip S4-3 to
  DONE while S3-2 is PARTIAL.
- All other S4 items (S4-1, S4-2, S4-4) are single-PR pure-restyle/token work — no
  PARTIAL expected.

## Failure-modes-verified
- **Markdown round-trip drift** (the H/F serializer lessons) → capture the pre-S4
  golden bytes, then a test asserts `serialize(parse(serialize(doc)))` is
  **byte-identical** before/after S4; S4-2 must touch only `.parchment-prose` CSS,
  never the doc model. (Verified: H4–H6 already exist as StarterKit heading levels —
  S4-2 adds CSS only, no schema change.)
- **Missing / CDN font** (the K2 precedent) → the woff2 (Roboto 400/500/700,
  Roboto Mono 400, Material Symbols Rounded) + licenses are shipped in
  `public/fonts/` by **S1-8** exactly as OpenDyslexic is (globals `@font-face`
  L149–162). Network panel on the deploy shows **no external font fetch**; a
  fallback stack (`Roboto`→`system-ui`; `Google Sans`→`Roboto`) renders if a face
  is missing. **Google Sans is not redistributable** — it is listed first but
  Roboto (self-hosted) is the real shipped UI face. (S4 verifies the ramp renders
  on top of S1-8's faces.)
- **`grep` false positives for "Inter"** → the only literal `Inter` *font* reference
  is `theme.ts` L50; the repo also contains `Interval`/`interaction`/`humanizeInterval`
  (non-font). The accept-grep targets the font pair specifically, not a bare
  case-insensitive `inter`.
- **Icon-set swap breakage** (Material Symbols not loading → tofu/blank glyphs) →
  snapshot the toolbar (#5) + sidebar; every icon must render a glyph. The `<Icon>`
  wrapper inlines the SVG path from `@material-symbols/svg-400` (self-hosted), so a
  failed font load still shows the vector.
- **pt vs px mismatch** (ramp specified in pt) → author the ramp **in pt directly**
  (`font-size: 20pt`), then assert rendered px on the deploy (1pt = 1.3333px: 20pt →
  26.6px, 16pt → 21.3px, 11pt → 14.7px). No manual px conversion to drift.
- **Build / bundle** (font + icon imports breaking Turbopack — recurring lesson) →
  `pnpm build --turbopack` compiles; `@material-symbols/svg-400` is imported only
  in the client `<Icon>` component and must **not** be pulled onto the `getSchema`
  server path in `Editor.tsx` (the schema build runs server-side). Verify the icon
  package is absent from the server bundle.
- **Chrome vs. document font divergence** → chrome reads `var(--font-ui)` (Roboto),
  the document reads `var(--font-body)` (Arial) on `.parchment-prose`; `body` must
  not force Arial onto chrome. Verified: globals `body` L193 reads `var(--font-body)`
  — S4-1 repoints chrome containers to `--font-ui` so the two stay independent.
