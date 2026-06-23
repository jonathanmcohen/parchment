# Plan S1 — Color, theme tokens, surfaces

> ⛔ HOLD. The token foundation every later plan consumes. Land S1 first.
> No branch, no code, no PR until the user replies "GO" on Plan S1. On GO this
> banner flips to "🟢 GO — Plan S1".

**Intent:** kill the purple/cream identity, install the Google palette as CSS
vars, and make page surfaces read as white-on-gray like Google Docs. All later
plans reference the S1 vars — **no hardcoded hex after S1.**

> **Adversarial-review note (2026-06-23):** an adversarial review found 22
> blocking/important + 9 minor findings against this scaffold. This file was
> revised to close them. The single source of truth for var names is the
> **Token vocabulary (canonical)** section directly below — every plan
> (S1–S5) uses ONLY those names; S1-7 mints ALL of them; no plan may invent an
> ad-hoc var. The full close-out matrix is
> [coverage-matrix.md](coverage-matrix.md).

---

## Token vocabulary (canonical)

**This is the ONE name per concept that EVERY plan (S1–S5) must use.** S1-7 mints
all of them in `src/styles/tokens.css`. Any var name that appears in an S2/S3/S4/S5
CSS rule and is NOT in this table is a bug — grep any plan for a var not listed
here should return empty. Hex values are the **light-scheme** target; each token
also has a dark-scheme value (S1-7 + the per-item dark blocks below).

### Brand (FIXED Google-Docs blue — chrome only, NEVER the user accent)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--primary` | `#1A73E8` | `#8AB4F8` | primary buttons, active nav/toolbar pill text, links target, focus ring source, Share button |
| `--primary-hover` | `#1765CC` | `#AECBFA` | primary hover |
| `--primary-pressed` | `#185ABC` | `#AECBFA` | primary pressed |
| `--primary-surface` | `#E8F0FE` | `#283142` | active pill / selected-row background (active nav row, pressed toolbar pill, active outline row) |
| `--on-primary` | `#FFFFFF` | `#202124` | text/icon ON a `--primary` fill (Share button label, etc.) |

The brand tokens are **fixed**. They are NOT the per-workspace accent picker. See
the "Fixed brand vs user accent" subsection below — chrome consumes `--primary*`,
in-document accent consumes `--accent`.

### Ink (text) — REUSE existing tokens; do NOT invent `--ink`/`--text`/`--text-muted`
| Token | Light | Dark | Role |
|---|---|---|---|
| `--foreground` | `#202124` | `#E8EAED` | all primary ink: prose body, headings, doc title, wordmark, nav/menu text |
| `--muted` | `#5F6368` | `#9AA0A6` | secondary ink: subtitle, bottom-cluster name/lang, muted labels, status bar |

S2/S3/S4/S5 reference `--foreground`/`--muted` — **never** `--ink`, `--ink-muted`,
`--text`, `--text-muted`, `--text-title`, `--color-heading`, or `--text-overline`.
(A heading/title that needs a different *size/weight* gets a font/size token from
S4 — the *color* is still `--foreground`/`--muted`.)

### Surfaces
| Token | Light | Dark | Role |
|---|---|---|---|
| `--surface` | `#FFFFFF` | `#292A2D` | white panels: sidebar, dialogs, dropdowns, title/menu/toolbar/status bars, page canvas |
| `--surface-muted` | `#F8F9FA` | `#35363A` | gray-50 fill: outline rail, code bg, muted cards |
| `--surface-hover` | `#F1F3F4` | `#3C4043` | the hover pill (`#F1F3F4`) — NOT `--hover`, NOT `--accent-pill` |
| `--border` | `#DADCE0` | `#5F6368` | structural / sidebar borders |
| `--border-chrome` | `#E8EAED` | `#3C4043` | editor title / menu / toolbar / status row borders (both `#DADCE0` and `#E8EAED` are real Google values — both are named, distinct tokens) |
| `--editor-gutter` | `#F1F3F4` | `#202124` | gray field the white page floats on |

> **Border resolution (closes the S3 `#E8EAED` vs S1 `#DADCE0` conflict):** the two
> are intentionally **two different tokens**. Structural/sidebar borders use
> `--border` (`#DADCE0`). The editor chrome rows (title/menu/toolbar/status) use
> `--border-chrome` (`#E8EAED`). S3 references `var(--border-chrome)`, S2 sidebar
> references `var(--border)`. Neither plan invents a literal.

### Selection / misc
| Token | Light | Dark | Role |
|---|---|---|---|
| `--selection-bg` | `#D2E3FC` | `#394457` | text selection highlight (ONE name — NOT `--selection`) |
| `--star` | `#FFD180` | `#FFD180` | starred glyph fill |
| `--tooltip-bg` | `#3C4043` | `#202124` | tooltip background |
| `--error` | `#D93025` | `#F28B82` | danger color (keep existing semantic) |

(`--warning`/`--success`/`--info`/`--link`/`--code-bg`/`--highlight` remain as
S1-7 mints them; unchanged by this review.)

### Elevation (every dropdown/dialog/popover references these — NO inline shadow literals)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--shadow-page` | `0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.30)` | softer on `#202124` | the page sheet (two-layer Docs) |
| `--shadow-dropdown` | `0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15)` | `0 1px 3px rgba(0,0,0,.6), 0 4px 8px 3px rgba(0,0,0,.4)` | every dropdown/popover/menu (was `--shadow-menu`) |
| `--shadow-dialog` | `0 24px 38px 3px rgba(60,64,67,.16), 0 9px 46px 8px rgba(60,64,67,.12), 0 11px 15px -7px rgba(60,64,67,.20)` | dark equivalent on `#292A2D` | Docs modal dialog elevation |

Every dropdown/dialog/popover/menu references one of these tokens — **no plan
writes an inline `box-shadow: 0 …` literal.** Each has a dark-mode variant (closes
the dark-shadow minor). The legacy name `--shadow-menu` is **renamed to
`--shadow-dropdown`**; `--page-shadow` is **renamed to `--shadow-page`` (S1-3
note); the old `box-shadow:0 8px 32px …` on `.parchment-dialog` is replaced by
`--shadow-dialog` (S5-11).

### Renamed/retired names (do NOT use anywhere)
`--text`, `--text-muted`, `--text-title`, `--color-heading`, `--text-overline`,
`--ink`, `--ink-muted` → use `--foreground`/`--muted`. `--hover`, `--accent-pill`,
`--active-pill` → use `--surface-hover` (hover) / `--primary-surface` (active).
`--active-pill-text` → `--primary`. `--selection` → `--selection-bg`.
`--shadow-menu` → `--shadow-dropdown`. `--page-shadow` → `--shadow-page`.
`--icon-muted` → `--muted`. `--danger` → `--error`. `--accent-hover` →
`--primary-hover`. Bare brand-pill background = `--primary-surface`.

---

## Fixed brand vs user accent (DECIDED)

The existing per-workspace **accent picker** (`themeCssVars()`,
`src/lib/editor/theme.ts:176–190`) emits `{'--accent': theme.accent,
'--accent-contrast': theme.accent}` **inline** on the `(app)/layout` wrapper, and
the K2 comment in that file states an inline custom property shadows any stylesheet
override. Therefore:

- **Chrome consumes `--primary*` (FIXED Google Blue), NEVER `--accent`.** Primary
  buttons, active nav/toolbar pills, the Share button, links in chrome, and the
  focus ring all point at `--primary` / `--primary-surface` / `--on-primary`.
- **`--accent` stays the user picker** (its default value may be blue) and drives
  **only in-document accent** (links/marks inside `.parchment-prose`,
  caret/selection accents the doc model already themes). S1-1 does **NOT** overwrite
  `--accent`/`--accent-contrast` with the brand.
- This way a user who picks the green/orange swatch repaints **in-document accent
  only** — the Google-Docs **chrome stays blue**. (Closes finding #13 + the
  accent-picker minor.) A dedicated S1-1 Failure-mode verifies this.

**Verified files (from the code map — real paths/lines):**

| File | What S1 touches |
|---|---|
| `src/app/globals.css` | All `:root` / scheme palettes (L14–121), `@theme inline` (L178–186), `:focus-visible` ring (L207–211), selection (NEW), collab caret (L2515–2558), and ~40 hardcoded literals scattered through component classes. |
| `src/lib/editor/theme.ts` | `ACCENT_SWATCHES` (L64–73), `DEFAULT_THEME.accent` (L88), `resolvePageBg` (L153–158), `themeCssVars` (L176–190). |
| `src/app/(app)/layout.tsx` | Theme wrapper that sets `data-color-scheme` + inline `themeStyle` (L42–53); `<main>` is the editor-route gutter host (L86). |
| `src/app/layout.tsx` | `viewport.themeColor` `#7c5cff` (L20). |
| `src/app/manifest.ts` | `background_color` `#f7f6f3`, `theme_color` `#7c5cff` (L10–11). |
| `src/lib/editor/track-changes.ts` | `authorColor()` per-user hue PALETTE (L29–50) — already a hash→hue mechanism; S1 only retunes the seed/selection, builds no new logic. |
| `src/components/editor/{VersionHistory,CommentsSidebar,BacklinksPanel}.tsx` | Consume `var(--surface,#fff)` / `var(--surface-hover,#f9fafb)` fallbacks that are **never defined** today — S1-7 defines them. |
| `public/fonts/` + `package.json` | **S1-8** adds self-hosted Roboto/Roboto Mono/Material Symbols woff2 + `@material-symbols/svg-400` (font FACES move here from S4 so S2/S3 don't render tofu — finding #17). |

**NEW file:** `src/styles/tokens.css` — single source of truth for every color
var, `@import`-ed at the top of `globals.css`. (Tailwind v4: there is **no**
`tailwind.config`; theme mapping lives in the `@theme inline` block of
`globals.css` — S1-7 maps the new vars there, not in a config file.)

**Scope guard:** S1 is **restyle/retoken only.** No component behavior changes,
no new chrome components (those are S2/S3). Where a value is hardcoded in a
component's inline style (VersionHistory etc.), S1 swaps the literal for a var —
it does not refactor the component.

---

### S1-1 — Introduce the FIXED `--primary*` brand; point chrome at it; keep `--accent` as the user picker

**Files:** `src/styles/tokens.css` (NEW — define `--primary*`), `src/app/globals.css`
(repoint chrome literals/`--accent-contrast` refs to `--primary*`), `src/lib/editor/theme.ts`
(L88 default accent, L64–73 swatches — picker default only), `src/app/layout.tsx`
(L20), `src/app/manifest.ts` (L11).

**Decision (DECIDED — do not re-litigate):** the chrome brand is a NEW **fixed**
set of `--primary*` tokens (see the canonical vocabulary + the "Fixed brand vs
user accent" subsection). S1-1 **mints** `--primary`/`--primary-hover`/
`--primary-pressed`/`--primary-surface`/`--on-primary` and **points all chrome at
them**. It does **NOT** overwrite `--accent`/`--accent-contrast` with the brand —
`--accent` remains the per-workspace picker (default value may be blue) and drives
**in-document accent only**. This separation closes finding #13: a user who picks a
non-default accent swatch must still see Google-Blue chrome.

**Current → Target:**
- NEW `--primary` → **`#1A73E8`** (dark **`#8AB4F8`**) — the fixed brand.
- NEW `--primary-hover` → **`#1765CC`** (dark `#AECBFA`); NEW `--primary-pressed` →
  **`#185ABC`** (dark `#AECBFA`).
- NEW `--primary-surface` → **`#E8F0FE`** (dark `#283142`); NEW `--on-primary` →
  **`#FFFFFF`** (dark `#202124`).
- **Repoint chrome** that today reads `var(--accent-contrast)` (toolbar-btn pressed
  L498, dialog primary L1011, size-btn L460, toc-btn L1098, dialog-tab L914,
  skip-link L232, image handles, table selected cell, the focus ring S1-6) to
  `var(--primary)` (and pill fills to `var(--primary-surface)`, on-fill text to
  `var(--on-primary)`). These are **chrome** — they must be fixed blue.
- **Leave the picker alone:** `--accent`/`--accent-contrast` keep tracking
  `theme.accent` via `themeCssVars()`. Set the picker **default** to Google Blue
  for a clean out-of-box look: `DEFAULT_THEME.accent` `#6d28d9` → **`#1A73E8`**;
  first `ACCENT_SWATCHES` entry `#6d28d9` → **`#1A73E8`** (keep the other 7
  swatches — they are user-selectable in-document accents, not the brand). The
  remaining `var(--accent, #7c3aed)` literal fallbacks (suggesting indicator
  L2346–2364) become bare `var(--accent)` (purple residue).
- `viewport.themeColor` `#7c5cff` → **`#1A73E8`**; `manifest.theme_color`
  `#7c5cff` → **`#1A73E8`** (use the literal here — these are static manifest
  values outside the CSS-var system).

**Change** (in `tokens.css`, consumed by the existing `@theme inline`):
```css
:root, [data-color-scheme="light"] {
  /* FIXED brand — chrome only, picker can NEVER repaint these */
  --primary:         #1A73E8;
  --primary-hover:   #1765CC;
  --primary-pressed: #185ABC;
  --primary-surface: #E8F0FE;
  --on-primary:      #FFFFFF;
}
[data-color-scheme="dark"] {
  --primary:         #8AB4F8;
  --primary-hover:   #AECBFA;
  --primary-pressed: #AECBFA;
  --primary-surface: #283142;
  --on-primary:      #202124;
}
```
In `globals.css`, swap chrome `var(--accent-contrast)` → `var(--primary)` at the
sites listed above (pill bg → `var(--primary-surface)`, text-on-fill →
`var(--on-primary)`). **No new feature logic** — pure recolor + a token rename for
chrome. (`--accent` stays wired to the picker; the only `theme.ts` change is the
default value + first swatch.)

**Accept:** grep `#7c5cff|#6d28d9|#7c3aed|#9a82ff` in `src/` → only intentional
non-accent uses remain (track-changes PALETTE, speaker-note `#9a82ff` retuned in
S1-4). Toolbar pressed button, dialog "primary" button, active dialog tab, Share
button, focus ring all render Google Blue **and stay blue when the workspace accent
is set to a non-default swatch.** Proven by visual surfaces **#5 (editor
toolbar-overflow open)** + **#6 (share dialog open)** + **#7 (settings→theme)**;
axe color-contrast clean.

**Steps:**
1. Snapshot baseline (RED): capture surfaces #4–#7 on `release/v0.1.1` pre-change
   (still purple) — these become the "before" artifacts.
2. Add `--primary*`/`--on-primary` to `tokens.css`; `@import` it from `globals.css`
   line 1 (before `@import "tailwindcss"` is fine — vars resolve at use site).
3. Repoint chrome `var(--accent-contrast)` refs → `var(--primary)` /
   `var(--primary-surface)` / `var(--on-primary)`; replace stray
   `var(--accent, #7c3aed)` fallbacks with bare `var(--accent)`.
4. Update `theme.ts` picker default + first swatch; update `layout.tsx` +
   `manifest.ts` static theme colors.
5. Live-verify on deploy: toolbar, dialog, settings, Share button, focus ring
   render blue; **then set the workspace accent to a non-blue swatch and confirm
   the chrome stays blue** (only in-document accent changes); update baselines
   #4–#7 in the same PR.

---

### S1-2 — Page-outside background `#F1F3F4`

**Files:** `src/app/globals.css` (NEW `.parchment-editor-gutter` rule or reuse
`<main>`), `src/styles/tokens.css` (token), `src/app/(app)/layout.tsx` (L86
`<main>` — apply gutter token on editor route only).

**Current → Target:** the editor `<main id="main-content">` currently inherits
`--background` `#f7f6f3` (cream); the page sits flush with no visible gutter.
Target: editor canvas region background **`#F1F3F4`** (Docs gray gutter) so the
white page edge reads as a floating sheet.

**Change:** add token `--editor-gutter: #F1F3F4;` (dark: `#202124`). The gutter
is the **full-width** scrolling region *around* `.parchment-page`.

> **Container note (closes the S1-2 gutter minor):** the editor content lives in a
> centered `max-w-5xl` wrapper. Painting `--editor-gutter` on that wrapper would
> only color a centered column, NOT the full-bleed gray field Docs shows. The
> gutter background must go on the **full-width scroll region** — the editor
> route's `<main id="main-content">` (`(app)/layout.tsx:86`), which spans the
> viewport width minus the sidebar — NOT the inner `max-w-5xl` container. Apply the
> class to that full-width element so the white `max-w-5xl` page floats on a
> full-bleed gray field.

```css
/* Editor route gutter — full-bleed gray field the white page floats on */
.parchment-editor-shell { background: var(--editor-gutter); }
```
Apply `parchment-editor-shell` to the editor route's full-width `<main>` region
(not the centered `max-w-5xl` wrapper). **Do not** change the global `--background`
here (that is S1-4) — this is a scoped gutter so files/settings pages keep their
own surface. No layout/behavior change — only a background color on an existing
full-width container.

**Accept:** editor route (`/d/[id]`) shows a gray `#F1F3F4` field with a white
page floating in it; files/settings pages unaffected. Proven by visual surface
**#4 (doc editor — idle)**.

**Steps:**
1. RED baseline of surface #4 (flush cream, no gutter).
2. Add `--editor-gutter` token + `.parchment-editor-shell` rule; apply class to
   the editor container.
3. Live-verify gutter visible around page; files/settings unchanged. Update
   baseline #4.

---

### S1-3 — Page canvas pure white + Docs shadow

**Files:** `src/app/globals.css` `.parchment-page` (L250–258), `--page-shadow`
(L30), `src/lib/editor/theme.ts` `resolvePageBg` (L153–158).

**Current → Target:**
- `.parchment-page` background = `var(--page-bg, var(--paper))`. `--paper` is
  `#ffffff` already, but the `white` preset routes through `resolvePageBg`
  → `#ffffff`. Target stays **`#FFFFFF`** (already correct; confirm the gutter
  in S1-2 makes the white legible).
- `--page-shadow` `0 2px 8px 0 rgb(0 0 0 / 0.1)` is **renamed to `--shadow-page`**
  (canonical vocabulary) → **`0 1px 3px rgba(60,64,67,.15), 0 1px 2px
  rgba(60,64,67,.30)`** (two-layer Docs elevation, Google gray-900 rgb).

**Change** (in `tokens.css`):
```css
:root, [data-color-scheme="light"] {
  --shadow-page: 0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.30);
}
```
Update `.parchment-page` (L255) to read `box-shadow: var(--shadow-page)` (rename
the var ref from the old `--page-shadow`). Keep the 1px `var(--border)` page border
(Docs has a hairline). Dark scheme keeps a softer shadow on `#202124` gutter.

**Accept:** page is pure `#FFFFFF` with the two-layer drop shadow against the
`#F1F3F4` gutter. Proven by visual surface **#4**; pixel-diff shows the shadow.

**Steps:**
1. RED baseline #4 (single soft shadow).
2. Retune `--page-shadow` token.
3. Live-verify two-layer shadow renders; update baseline #4.

---

### S1-4 — Drop cream surfaces

**Files:** `src/app/globals.css` (`:root` L16, `--paper` already white; reading
sepia L3021–3030; speaker-note `#9a82ff` L3223–3235; code `#f6f8fa`/`#1e2030`
L1489/1504/1632/1644; mark `#fef08a` L613; presenter/print hardcodes L3059+/L3252+),
`src/styles/tokens.css` (surface tokens), `src/app/manifest.ts` (L10), tag-colors
unaffected.

**Current → Target:**
- `--background` `#f7f6f3` (cream) → **`#FFFFFF`** (Docs app bg is white; the
  *editor* gutter gray is S1-2's scoped token, not the global bg).
- NEW `--surface` → **`#FFFFFF`** (today only a fallback literal in
  VersionHistory/CommentsSidebar/BacklinksPanel/globals L2375).
- NEW `--surface-muted` / `--surface-hover` → **`#F8F9FA`** (Docs gray-50;
  replaces the undefined `var(--surface-hover, #f9fafb)` fallback).
- `manifest.background_color` `#f7f6f3` → **`#FFFFFF`**.
- `--muted` `#6b6b63` (warm gray) → **`#5F6368`** (Google gray-700) so muted text
  loses the cream cast.
- `--border` `#e3e1da` (warm) → **`#DADCE0`** (Google gray-300).
- `--foreground` `#1a1a17` → **`#202124`** (Google gray-900).

**Change** (`tokens.css`):
```css
:root, [data-color-scheme="light"] {
  --background: #FFFFFF;  --foreground: #202124;  --muted: #5F6368;
  --paper: #FFFFFF;       --border: #DADCE0;
  --surface: #FFFFFF;     --surface-muted: #F8F9FA;  --surface-hover: #F8F9FA;
}
[data-color-scheme="dark"] {
  --background: #202124;  --foreground: #E8EAED;  --muted: #9AA0A6;
  --paper: #292A2D;       --border: #5F6368;
  --surface: #292A2D;     --surface-muted: #35363A;  --surface-hover: #35363A;
}
```
Sweep remaining warm literals: `mark` `#fef08a` → `var(--highlight, #FEF7C3)`
(Docs yellow-100, new token); reading-mode sepia is a *user reading preference*,
not chrome — **leave** `#f4ecd8`/`#2a2318` (out of the Google-chrome scope).
Code-block `#f6f8fa`/`#1e2030` → tokens `--code-bg` `#F8F9FA` / dark `#292A2D`.
Speaker-note `#9a82ff` (purple residue) → `var(--accent)`.

**Accept:** `grep -iE '#f7f6f3|#f5efe0|f9fafb' src/` → **zero** (the
`var(--surface-hover, #f9fafb)` fallbacks now resolve to the defined token; the
literal fallback may stay as a belt-and-braces default but must equal `#F8F9FA`).
Every chrome surface is `#FFFFFF` or `#F8F9FA`. Proven by surfaces **#2 (files
page)**, **#3 (file list)**, **#7 (settings→theme)**; axe contrast on muted text
(`#5F6368` on `#FFFFFF` = 6.05:1 ✔ AA).

**Steps:**
1. RED baselines #2, #3, #7 (cream surfaces).
2. Define `--surface*` / retune `--background`/`--muted`/`--border`/`--foreground`
   in `tokens.css`; define `--highlight`, `--code-bg`.
3. Sweep literal `#fef08a`, `#f6f8fa`, `#1e2030`, speaker-note `#9a82ff` → vars.
4. Update `manifest.background_color`.
5. Live-verify no cream anywhere; update baselines #2, #3, #7.

---

### S1-5 — Selection + collab cursors

**Files:** `src/app/globals.css` (NEW `::selection` rule; collab caret/label/
selection L2522–2558), `src/lib/editor/track-changes.ts` `authorColor` PALETTE
(L29–34), `src/styles/tokens.css`.

**Current → Target:**
- No global `::selection` rule today → add **`background:#D2E3FC; color:inherit`**
  (Docs blue selection). Dark: `#394457` (Docs dark selection) so text isn't
  washed out.
- `.collaboration-carets__selection` `rgba(0,0,0,0.08)` (L2557) → keep the inline
  per-author alpha blend but ensure it reads as a tint, not gray.
- `authorColor()` already returns a **per-user hue** via djb2 hash into a
  12-entry PALETTE (track-changes.ts L46–50) — the mechanism exists. S1 only
  retunes the PALETTE so the first/default hue is Google Blue-family and the set
  is visually distinct on white (the current PALETTE includes `#6d28d9` violet
  residue at L33 — swap to a Google-friendly hue). **No new logic.**

**Change:**
```css
/* tokens.css */
:root { --selection-bg: #D2E3FC; }
[data-color-scheme="dark"] { --selection-bg: #394457; }
/* globals.css */
::selection { background: var(--selection-bg); color: inherit; }
.parchment-prose ::selection { background: var(--selection-bg); color: inherit; }
```
In `track-changes.ts`, replace the `#6d28d9` PALETTE entry with a Docs hue (e.g.
`#1A73E8` or `#9334E6`); keep 12 distinct entries so a 2nd client gets a clearly
different caret. This is a pure-data change → **TDD**: a unit test asserts
`authorColor` is deterministic and that two distinct author ids map to different
hex (already testable logic).

**Accept:** selecting body text shows the `#D2E3FC` Docs-blue highlight (not the
old purple-tinted `var(--accent) 25%`); a 2nd collab client renders a
distinct-hue caret + label. Proven by surface **#4** (select text in the snapshot
fixture) + axe contrast on selected text (dark `#394457` selection keeps text AA).

**Steps:**
1. RED: unit test for `authorColor` determinism/distinctness (write first); RED
   baseline #4 with a selection.
2. Add `--selection-bg` + `::selection` rules; retune PALETTE.
3. Run unit test green; live-verify selection color + a 2-client caret distinct
   hue. Update baseline #4.

---

### S1-6 — Focus ring

**Files:** `src/app/globals.css` `:focus-visible` (L207–211), plus the bespoke
rings that hardcode `var(--accent-contrast)` (skip-link L245, dialog-input L965,
outline-link L1347, cb-btn L1620, find-input — these already track the accent var
so they auto-update once the accent is blue).

**Current → Target:** `:focus-visible { outline: 2px solid var(--accent-contrast);
outline-offset: 2px; border-radius: 2px }` — already 2px/offset-2px; once S1-1
makes `--accent-contrast` = `#1A73E8` the ring **is** `2px #1A73E8`. Target
confirms: **`outline:2px solid #1A73E8; outline-offset:2px`** on every focusable
(supersedes K3's accent ring — same selector, new color via the token).

**Change:** no rule rewrite — S1-1 already retargets the token the ring reads. The
*verification* is the work: audit every `outline:none` to confirm a
`:focus-visible` replacement exists (the recurring trap). Existing `outline:none`
sites (cb-btn L1621, filename-input L1551, find-input L1941) each pair with a
visible `:focus`/`:focus-visible` substitute — confirm and document. Dark scheme:
ring is `#8AB4F8` (S1-1 dark accent) — verify AA against `#202124` gutter.

**Accept:** Tab through chrome + editor → every focused control shows a 2px blue
offset ring; axe `focus-visible` / "focusable element must have visible focus"
clean in light AND dark. Proven by a **Playwright keyboard-tab snapshot** (new,
see Verification gate) asserting a visible ring on each focusable, on surfaces
#2/#4/#6/#7.

**Steps:**
1. RED: axe focus-visible run on `release/v0.1.1` (purple ring) as the before.
2. Confirm token retarget from S1-1 lands the blue ring (no new rule).
3. Audit/grep `outline:\s*none` — assert each has a `:focus-visible` pair; add a
   Playwright tab-walk test that screenshots the focused control.
4. Live-verify tab-walk shows blue ring in light + dark; axe clean.

---

### S1-7 — Token file `src/styles/tokens.css`

**Files:** NEW `src/styles/tokens.css`; `src/app/globals.css` (`@import` it at
top; the `@theme inline` block L178–186 maps the new semantic tokens for Tailwind
utilities); `src/components/editor/{VersionHistory,CommentsSidebar,BacklinksPanel}.tsx`
(the `var(--surface*,…)` fallbacks now resolve to real tokens).

**Current → Target:** colors are scattered across `globals.css` `:root`/scheme
blocks + ~40 literals in component classes, and three components reference
**undefined** `--surface`/`--surface-hover`. Target: **one file** holds every
color var for light/dark/system + high-contrast; components reference vars only;
**Settings → Account → Theme (light/dark/follow-system) is a clean var swap.**

**Change:** create `src/styles/tokens.css` containing **every token in the
canonical vocabulary** (see the "Token vocabulary (canonical)" section at the top
of this file — S1-7 mints ALL of them, light + dark; grep any plan for a var not
in that list must return empty):
```css
:root, [data-color-scheme="light"] {
  /* core ink */        --background:#FFFFFF; --foreground:#202124; --muted:#5F6368;
                        --paper:#FFFFFF;
  /* fixed brand */     --primary:#1A73E8; --primary-hover:#1765CC; --primary-pressed:#185ABC;
                        --primary-surface:#E8F0FE; --on-primary:#FFFFFF;
  /* user accent */     --accent:#1A73E8; --accent-contrast:#1A73E8;  /* picker default; themeCssVars overrides inline */
  /* surfaces */        --surface:#FFFFFF; --surface-muted:#F8F9FA; --surface-hover:#F1F3F4;
                        --border:#DADCE0; --border-chrome:#E8EAED;
  /* editor */          --editor-gutter:#F1F3F4; --selection-bg:#D2E3FC;
                        --code-bg:#F8F9FA; --highlight:#FEF7C3; --star:#FFD180; --tooltip-bg:#3C4043;
  /* elevation */       --shadow-page: 0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.30);
                        --shadow-dropdown: 0 1px 3px rgba(60,64,67,.30), 0 4px 8px 3px rgba(60,64,67,.15);
                        --shadow-dialog: 0 24px 38px 3px rgba(60,64,67,.16), 0 9px 46px 8px rgba(60,64,67,.12), 0 11px 15px -7px rgba(60,64,67,.20);
  /* semantic (NEW) */  --link: var(--accent);
                        --error:#D93025; --warning:#F29900; --success:#188038; --info:#1A73E8;
}
[data-color-scheme="dark"] {
  --background:#202124; --foreground:#E8EAED; --muted:#9AA0A6; --paper:#292A2D;
  --primary:#8AB4F8; --primary-hover:#AECBFA; --primary-pressed:#AECBFA;
  --primary-surface:#283142; --on-primary:#202124;
  --surface:#292A2D; --surface-muted:#35363A; --surface-hover:#3C4043;
  --border:#5F6368; --border-chrome:#3C4043;
  --editor-gutter:#202124; --selection-bg:#394457; --code-bg:#292A2D;
  --star:#FFD180; --tooltip-bg:#202124;
  --shadow-page: 0 1px 2px rgba(0,0,0,.6), 0 2px 6px 2px rgba(0,0,0,.3);
  --shadow-dropdown: 0 1px 3px rgba(0,0,0,.6), 0 4px 8px 3px rgba(0,0,0,.4);
  --shadow-dialog: 0 24px 38px 3px rgba(0,0,0,.5), 0 9px 46px 8px rgba(0,0,0,.4), 0 11px 15px -7px rgba(0,0,0,.6);
  --error:#F28B82; /* …rest of dark values from S1-1…S1-6 */
}
```
**Note the two border tokens** (`--border` structural / `--border-chrome` editor
rows) and the **three elevation tokens** (`--shadow-page`/`--shadow-dropdown`/
`--shadow-dialog`, each with a dark variant) — these close the border-hex and
dark-shadow conflicts/minors. The brand `--primary*` are FIXED (S1-1); `--accent*`
remain the picker.
Move the light/dark/system + high-contrast palette blocks out of `globals.css`
into `tokens.css` (the K2 high-contrast overrides L86–121 move too, so HC stays a
var swap layered on scheme). Map the new tokens in `@theme inline` so
`bg-surface` / `text-muted` Tailwind utilities work. **Sweep the semantic
literals** the gap list named (`#dc2626` dialog-required/error L949/997/2053,
`#15803d`/`#be123c` suggestions accept/reject L2498–2513, `#b91c1c` share-error
L2607, `#d97706` grammar L1836) → `--error`/`--success`/`--warning`/`--info`.
This is mechanical token substitution, **no behavior change.**

**Newly-discovered scope note:** the audit gap "No `--surface-hover` defined"
is now an **active latent bug** — VersionHistory/CommentsSidebar render with the
`#f9fafb` *fallback* literal today, which is a warm-ish gray that S1-4 replaces
with `#F8F9FA`. Defining the token fixes three components at once. Low risk,
in-scope for S1-7.

**Canonical-vocabulary guarantee (closes the token-fragmentation findings #4, #12,
#14, #15, #22 + the selection/border minors):** S1-7 mints EVERY token in the
"Token vocabulary (canonical)" table at the top of this file — `--primary*`,
`--on-primary`, `--foreground`/`--muted`, `--surface`/`--surface-muted`/
`--surface-hover`, `--border`/`--border-chrome`, `--editor-gutter`,
`--selection-bg`, `--star`, `--tooltip-bg`, `--error`, and the three
`--shadow-*` elevations (each with a dark variant). S2/S3/S4/S5 reference ONLY
these names. The accept-grep below is the proof.

**Accept:** toggling Settings → Theme light↔dark↔system re-maps the vars only —
no component hardcodes a color (`grep -iE '#[0-9a-f]{3,6}' src/components | grep
-v 'tag-colors\|track-changes'` → only deliberate exceptions). `grep --surface
src/` shows the token **defined**, not just fallback'd. Proven by surface **#7
(settings→theme)** captured in light AND dark (the I1 wrapper-propagation lesson:
body/gutter must take the scheme, not just the inner div) + the full surface set
re-snapshotting unchanged except color.

**Steps:**
1. RED baseline #7 in light + dark (pre-extraction).
2. Create `tokens.css`; move all scheme + HC palette blocks into it; `@import`
   from `globals.css`; map new tokens in `@theme inline`.
3. Sweep semantic literals → `--error/--warning/--success/--info`; sweep
   `--surface*` fallbacks (keep a matching literal fallback as defense).
4. TDD-friendly: a snapshot/CSS test that the `:root` exposes every required var
   name (catches a dropped token in extraction).
5. Live-verify theme toggle swaps vars cleanly in both schemes; body + gutter
   follow; update **all 7 baselines**.

---

### S1-8 — Font + icon FACE loading (faces only; ramp/sizing stays in S4)

**Files:** `public/fonts/` (add self-hosted woff2 + licenses), `src/app/globals.css`
(`@font-face` blocks, alongside the existing K2 OpenDyslexic block at L149–162),
`src/styles/tokens.css` (the `--font-*` token **defaults**), `package.json`
(`@material-symbols/svg-400` for the icon SVGs).

**Why this is in S1 (DECIDED — closes finding #17):** S2 and S3 reference
`material-symbols-rounded` glyphs and Google Sans / Roboto faces in their CSS, but
the original plan loaded those faces in **S4**, which runs AFTER S2/S3 in the
mandated S1→S5 order. On the integration branch, S2/S3's icons/text would render as
tofu/fallback until S4 landed. Fix: **load the faces in S1** (the
tokens/foundation step). S1-8 ships the `@font-face` declarations + the
`--font-ui`/`--font-body`/`--font-mono` token **defaults**; **S4 keeps the type
RAMP / sizing / weight / Arial-body / drop-Inter work** (it no longer loads faces,
only sizes/weights them). After S1-8, no plan references a font the prior plan
hasn't loaded.

**Current → Target:**
- No Google Sans / Roboto / Roboto Mono / Material Symbols faces are loaded today
  (only OpenDyslexic, K2). → Self-host **Roboto 400/500/700**, **Roboto Mono 400**,
  and the **Material Symbols Rounded** variable font as woff2 in `public/fonts/`
  (each with its Apache-2.0 license), mirroring the K2 OpenDyslexic precedent
  (binaries + license in `public/fonts/`, no CDN). Google Sans is **not**
  redistributable — the UI stack lists it first for users who have it, falling back
  to self-hosted Roboto.
- Add the icon SVG package `@material-symbols/svg-400` (Apache-2.0) so S4-3's
  `<Icon>` wrapper has a vector source (no CDN).
- Mint the `--font-*` token **defaults** in `tokens.css` (S4 may retune the exact
  stacks, but the *faces resolve* from S1):
  ```css
  :root {
    --font-ui:   "Google Sans","Roboto",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
    --font-body: Arial, sans-serif;
    --font-mono: "Roboto Mono","Menlo",monospace;
  }
  ```

**Change:** add the `@font-face` blocks (mirror the K2 OpenDyslexic block) for
Roboto 400/500/700, Roboto Mono 400, and Material Symbols Rounded; add a
`.material-symbols-rounded` base class (font-family + ligature settings) so S2/S3
can reference the glyph class immediately. **No sizing/weight ramp here** — that is
S4. **No new logic** — face declarations + token defaults + one dependency.

**Accept:** the deploy's network panel shows Roboto / Roboto Mono / Material
Symbols served from `/fonts/` (no external fetch); a `material-symbols-rounded`
span renders a real glyph (no tofu) **on the S2 integration branch, before S4
runs**; `--font-ui`/`--font-body`/`--font-mono` resolve. **Proves it:** a glyph
smoke snapshot on a sidebar nav row (S2 surface) renders a Material glyph, not
tofu, at S2 time. axe unaffected.

**Steps:**
1. Add woff2 + licenses to `public/fonts/`; add `@material-symbols/svg-400` to
   `package.json`; extend the fonts README (precedent: K2 OpenDyslexic).
2. Add the `@font-face` blocks + `.material-symbols-rounded` base class to
   `globals.css`; mint `--font-*` defaults in `tokens.css`.
3. Live-verify: network panel shows self-hosted faces only; a Material glyph
   renders.

---

## Coverage check

- **Audit gaps closed by S1:** purple identity (S1-1: accent/primary tokens +
  theme default + manifest/viewport); cream surfaces (S1-2 gutter, S1-3 page,
  S1-4 global bg/surfaces); selection + focus affordances (S1-5, S1-6);
  themability + missing semantic/surface tokens (S1-7: defines `--surface`,
  `--surface-hover`, `--surface-muted`, `--link`, `--error`/`--warning`/
  `--success`/`--info`, `--code-bg`, `--highlight`, `--selection-bg`,
  `--editor-gutter`, `--primary-hover`, `--primary-pressed` — every "No X token"
  gap from the map).
- **Latent bug surfaced & fixed:** `--surface-hover`/`--surface` were referenced
  as fallback-only in VersionHistory/CommentsSidebar/BacklinksPanel + globals
  L2375 — never defined. S1-7 defines them (was an undocumented gap; now owned).
- **Cross-plan (canonical vocabulary is the contract):** S1-7 mints EVERY token in
  the "Token vocabulary (canonical)" table; S2/S3/S4/S5 reference ONLY those names
  (no ad-hoc additions, no "reconcile at execution time" escape hatches — the names
  are decided here). S2 (sidebar → `--surface`, `--border`, `--primary*`,
  `--surface-hover`, `--primary-surface`, `--foreground`/`--muted`), S3 (editor
  chrome → `--surface`, `--border-chrome`, `--surface-hover`, `--primary`,
  `--primary-surface`, `--editor-gutter`), S4 (text colors → `--foreground`/
  `--muted`; **fonts are LOADED by S1-8**, S4 owns only ramp/sizing/weight), S5
  (hover/pressed → `--surface-hover`/`--primary-surface`/`--primary`; elevation →
  `--shadow-dropdown`/`--shadow-dialog`; misc → `--star`/`--tooltip-bg`/
  `--selection-bg`). ✔ no token unowned, no name fragmented.
- **Out of scope here (owned elsewhere):** font **ramp/sizing/weight** → S4 (S1-8
  loads the FACES + `--font-*` defaults); spacing tokens → S4-4; hover/pressed/
  disabled *behavior* → S5-1; dropdown elevation *shell class* → S5-3 (owner;
  `--shadow-dropdown` *token* minted here); dialog shell restyle → S5-11;
  reading-mode sepia + presenter/print overlay palettes are reader/print-surface
  preferences, **not Google-Docs chrome** — deliberately left out of the cream
  sweep (documented in S1-4) so S1 doesn't over-reach.

## Failure-modes-verified

- **Cream/purple residue** (a hardcoded hex the var swap misses) → per-item grep
  for `#7c5cff|#6d28d9|#7c3aed|#9a82ff|#f7f6f3|#f5efe0|#f9fafb|#fef08a` in `src/`
  returns zero outside the documented exceptions (track-changes PALETTE,
  tag-colors, reading sepia) + the live-deploy screenshot of each surface shows
  no purple/cream.
- **User accent repaints the chrome** (the finding-#13 hijack: `themeCssVars()`
  emits `--accent` inline, and an inline custom property shadows any stylesheet
  override per the K2 comment) → because chrome now reads the FIXED `--primary*`
  (not `--accent`), a non-default accent must NOT touch the chrome. **Verify:** set
  the workspace accent to a non-blue swatch (e.g. green/orange) and live-screenshot
  the editor — the Share button, focus ring, active toolbar/nav pill, and active
  dialog tab stay Google Blue; only in-document accent (prose links/marks) changes.
- **Persisted non-default accent + chrome** (the S1-1 minor: changing the picker
  default in `tokens.css` does NOT recolor a workspace that already persisted a
  custom accent, since `themeCssVars()` re-emits the persisted value inline) →
  this is **expected and correct now** that chrome is on `--primary*`: a persisted
  custom accent only affects in-document accent, never the blue chrome. The
  Failure-mode above is the proof; no migration of persisted accents is needed.
- **Undefined-token fallback masks the swap** (the `var(--surface-hover,#f9fafb)`
  trap — looks fine because the literal renders) → S1-7 grep asserts `--surface*`
  is **defined** in `tokens.css`, and the three consuming components are visually
  re-snapshotted (version-history drawer, comments drawer, backlinks panel) to
  confirm they shifted from `#f9fafb` to `#F8F9FA`.
- **Dark mode regression** (the I1 forced-scheme bleed: vars set on the wrapper
  not propagating to body/gutter via the `:root:has()` rule L50–54) → visual
  snapshot of settings→theme **and** the editor gutter in light AND dark; the
  body/gutter must take the scheme, not just the inner div. Verify the `:has()`
  propagation rule survives the move into `tokens.css`.
- **Selection contrast** (`#D2E3FC` highlight under dark theme washing out text)
  → dark uses `#394457` not `#D2E3FC`; axe contrast on selected text in both
  schemes.
- **Focus ring removed without replacement** (the recurring `outline:none` trap)
  → grep `outline:\s*none` in `globals.css`; assert each pairs with a
  `:focus-visible` substitute + axe + a Playwright keyboard-tab snapshot asserting
  a visible 2px blue ring on each focusable in light and dark.
- **Theme toggle breaks** (a literal that doesn't follow the var) → toggle
  light/dark/system on the deploy and snapshot all three; vars must be the only
  thing changing. The `@theme inline` map must list every new token or Tailwind
  utilities silently fall back.

## NEW infra this plan must stand up (newly-discovered)

The README's **7-surface visual-regression gate does not exist yet.**
`playwright.config.ts` runs `testDir: ./tests/e2e` with **axe-only** assertions,
one chromium project, **no `toHaveScreenshot`/`snapshotDir` config**, and there
are **no `*-snapshots` baseline dirs** in the repo. Before S1-1 can attach its
required RED/GREEN snapshot artifacts, S1 must add (as the first PR, or folded
into S1-7's infra):
- a Playwright **visual-regression** project (or `expect.toHaveScreenshot`
  config + a `tests/e2e/visual/` spec) covering the 7 surfaces (landing redirect,
  files page, file list, editor idle, editor toolbar-overflow open, share dialog
  open, settings→theme), each with a committed baseline;
- a keyboard-tab focus-ring spec (for S1-6).

**This is real, sized work (~1 PR of harness + 7 baselines), not a checkbox** —
it is a prerequisite for the per-PR artifact requirements of *every* item in
S1–S5. Recommend landing it as **S1's first merge** (call it S1-0 / infra) so the
rest of the release has the gate.
