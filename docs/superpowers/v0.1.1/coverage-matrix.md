# Parchment v0.1.1 — coverage matrix (audit close-out)

> 🟢 **GO — executing.** S1→S5 in progress; user gave GO 2026-06-23.
> GO on Plan S1. See [README](README.md).

An adversarial review of the v0.1.1 scaffold found **22 blocking/important + 9 minor
findings**. This matrix proves each is closed by the revised plans. The structural
fixes were: a **canonical token vocabulary** (one name per concept, minted in S1 —
plan-S1.md "Token vocabulary (canonical)"); the **fixed Google-Blue chrome brand**
(`--primary*`) separated from the user **accent picker** (`--accent`); the inline
doc-title save routed to the **existing `/rename` endpoint**; **font/icon faces
loaded in S1** (S1-8); a single **shared dropdown owned by S5-3**; and **five new
items** (S1-8, S2-6, S5-11/12/13) owning the previously-uncovered surfaces.

**Item count: 32 → 37.** Added: **S1-8, S2-6, S5-11, S5-12, S5-13.**

## Blocking / important findings (22)

| Item | Audit issue | Current cause (file:line) | The fix | Verifies via |
|---|---|---|---|---|
| **#1 / #20** S3-1 | Inline-title save targets a nonexistent `PATCH`/body-PUT that would 404 or clobber the body | `api/docs/[id]/route.ts` has only GET+PUT; PUT (`route.ts:26–30`) writes `contentJson ?? {}` / `markdown ?? ''`; `saveDocument` (`repo.ts:65–74`) unconditionally `.set` | S3-1 rewritten (Decision 3) to use the EXISTING title-only `POST /api/docs/[id]/rename` (`renameDocument`, `repo.ts:366`; used by `FileManager.tsx:687`) — title-only, cannot touch body | live-deploy: edit title → reload → title changed, body byte-intact; unit test asserts `/rename` `{title}` only, never body-PUT |
| **#2** S4-2 | Type ramp inks `var(--ink)`/`--ink-muted` that S1 never mints | S1 defines `--foreground`/`--muted`; `--ink` absent (grep) | S4 swept to `var(--foreground)`/`var(--muted)`; canonical vocab forbids `--ink*` | axe body-contrast `var(--foreground)` on white; computed color = #202124 |
| **#3 / #19** S5-9 / S3-1 | Save-status wired to a "lifecycle the editor already exposes" that doesn't exist | `Editor.tsx:797` `save` = fire-and-forget `void fetch`; no isSaving/saved/lastSaved state | Decision 4: **S3-1 builds the in-flight→settled→idle STATE** (small new logic, flagged); **S5-9 is COPY only**; false claims removed from both | Playwright: edit → "Saving…"→"All changes saved to disk"→idle "N min ago" driven by S3-1 state |
| **#4 / #12 / #15 / #22** cross-plan | Token names fragmented; S2/S3/S5 author rules against names S1 never defines; same concept has 3 names | S1 defined `--accent`/`--surface*`/`--selection-bg`/… but S2 used `--text`/`--active-pill`, S5 used `--hover`/`--selection`/`--shadow-menu` | **Canonical token vocabulary** added to S1 (one name per concept); S1-7 mints ALL; S2/S3/S5 swept; "reconcile at execution time" hedges removed | grep any plan for a var not in the canonical table → empty (verified) |
| **#5** GAP | Shared modal dialog shell never restyled to Docs elevation | `.parchment-dialog` (`globals.css:854`) `box-shadow:0 8px 32px`, 8px radius, `1.1rem/600` — 10+ dialogs consume it | **NEW S5-11** restyles `.parchment-dialog*` → `--shadow-dialog`, Google-Sans header, 24px grid, `--primary` button | axe on open dialog (focus trap/labels); live-deploy of Share + one other dialog |
| **#6** GAP | Share dialog (VR baseline #6) has no owning item, only a color sweep | README #60 / scope name it as VR #6; `ShareDialog.tsx` uses `.parchment-dialog*` | **S5-11** explicitly covers ShareDialog (+ all 10 dialogs); makes VR surface #6 truly owned | VR surface #6 baseline updated; live-deploy screenshot |
| **#7** GAP | Comments + version-history drawers have no parity-restyle item | S1 only token-swaps `CommentsSidebar.tsx` (516) / `VersionHistory.tsx` (778) | **NEW S5-13** redesigns both to Docs comment-card / revision-list layout + type | live-deploy screenshots of both drawers (README artifact surfaces) |
| **#8** GAP | Public share viewer `/share/[token]` owned by no item | `ShareViewer.tsx` (164) + `render-pm.tsx`; zero mentions in plans | **S5-13** gives it Docs framing (`--editor-gutter` + `.parchment-prose` + slim header; password gate uses S5-11 field type) | public unauthenticated `/share/<token>` screenshot; public axe |
| **#9** GAP | `/login` (the unauthed entry point per S5-6) restyled by no item | `(auth)/login/login-form.tsx` (188); only S5-6 redirect logic mentions login | **S5-13** restyles the sign-in card (`--surface`, Google-Sans heading, `--primary` submit) | live-deploy `/login` screenshot; axe public `/login` |
| **#10** GAP | No item makes the new chrome responsive; fixed 256px sidebar + 136px chrome | `(app)/layout.tsx:64` `<aside class="flex w-56 shrink-0">` no media query | **NEW S2-6** builds sidebar collapse/overlay + hamburger + editor-chrome narrow treatment (PARTIAL-flagged) | 375px responsive VR snapshot; axe at 375px |
| **#11** GAP | Floating editor surfaces keep 6px / pre-Docs shadow | `BubbleMenu.tsx` `.parchment-bubble-menu` (`globals.css:572`) radius 6px, `0 2px 8px`, purple pressed | **NEW S5-12** → `--shadow-dropdown`, 8px radius, white, `--primary-surface` pressed | live-deploy of bubble/slash/link; axe each |
| **#13** S1-1 | Fixed brand routed onto `--accent`, which the per-workspace picker overrides inline → user swatch repaints chrome | `themeCssVars()` (`theme.ts:176–190`) emits `--accent`/`--accent-contrast` inline; K2 comment: inline prop shadows stylesheet | Decision 2: S1-1 mints FIXED `--primary*`; chrome consumes `--primary*`, NOT `--accent`; `--accent` stays the in-document picker | live-deploy: set a non-blue accent swatch → chrome (Share/ring/pills) stays blue |
| **#14** cross-plan | Consumers reference bare `--primary` while S1 defined only `--primary-hover/-pressed` | `globals.css :root` had `--accent`, no `--primary` | S1-1 now mints bare `--primary` (+surface/on-primary); canonical vocab | grep: `--primary` defined in S1-7 token block |
| **#16** S3-2/S3-3 vs S5-3 | Two "single shared dropdown" components owned by different plans/files | `editor/menus/Menu.tsx` (S3-2) vs `ui/Dropdown.tsx` (S5-3) both "built once" | Decision 6: **S5-3 OWNS** the shared overlay-elevation shell (`.px-menu` + `--shadow-dropdown`); S2-1/S3-2/S3-3 CONSUME it; one component, one file | live-deploy: identical shadow/radius/rows across S2/S3/S5 menus |
| **#17** order | S2/S3 reference Material Symbols + Google Sans/Roboto, but S4 loads them later | order is S1→S5; S4-1/S4-3 added faces; S2/S3 verify earlier → tofu | Decision 7: **NEW S1-8** loads the faces + `--font-*` defaults; S4 keeps the ramp/sizing only | S2 integration branch: nav glyph renders (no tofu) before S4; network panel shows self-hosted faces |
| **#18** S2-4 vs S5-4 | View-switcher strip deletion claimed by BOTH S2-4 and S5-4 | `FileManager.tsx:2086–2109` `<nav aria-label="views">`; both plans "remove" it | Decision 8: **S2-4 is sole owner** (moves views + deletes strip); S5-4 references, does not re-delete; S5-1 styles sidebar rows instead | one delete of the JSX (S2-4); navless-gap failure-mode |
| **#21** S3-3 | "Format painter" + "Zoom" listed as reorderable existing controls but don't exist | grep `Toolbar.tsx`/`src/lib/editor`: no formatPainter/copyFormat, no zoom control, no spell-check toggle | Decision 8: Format painter/Zoom/Spell-check ship as **`aria-disabled` "coming soon" placeholders**; S3-3 surfaces only EXISTING controls; S3-3 scoped PARTIAL | live click-through: placeholders inert; S3-3 PARTIAL split in scope.md |
| **dup #1 (blocking) S3-1** | Title-only save wipes body; no PATCH; PUT/saveDocument overwrites | same as #1/#20 | same as #1/#20 — `/rename` endpoint | same as #1/#20 |
| **dup #4 (S4-2) blocking** | S4 references `--ink`/`--ink-muted`; S1 defines `--foreground`/`--muted` | `plan-S4.md` authored ramp on `var(--ink)` | swept to `--foreground`/`--muted` (see #2) | computed prose color #202124 |
| **dup token-graph (blocking)** | S2/S3/S5 consume ~15 names S1 never defines | `--text`/`--hover`/`--accent-pill`/`--selection`/`--shadow-menu`/`--primary-surface`… | canonical vocabulary + S1-7 mints all + plans swept (see #4) | grep plans for non-canonical var → empty |
| **dup brand-name (blocking)** | Bare `--primary` undefined while `-hover/-pressed` defined | `globals.css :root` no `--primary` | S1-1 mints bare `--primary` (see #14) | S1-7 token block |
| **#21-companion S3-2 placeholders** | Menu rows whose action doesn't exist not all flagged | Translate/Columns/Chart/Apps Script/Email/Add-ons have no handler | placeholder audit added to S3-2 (all disabled "coming soon"); S3-2 honestly PARTIAL | per-PR click-through; PARTIAL split in scope.md |

## Minor findings (9)

| Item | Audit issue | Current cause (file:line) | The fix | Verifies via |
|---|---|---|---|---|
| S2-1 tofu | Nav icons render as tofu until S4 loads the font | font loaded in S4 (after S2) | faces moved to **S1-8** (#17) | glyph smoke snapshot on a nav row at S2 time |
| S1-2 gutter | `.parchment-editor-shell` on a `max-w-5xl` container → no full-width gutter | gutter painted on centered column | S1-2 note: apply to the full-width `<main>` (`layout.tsx:86`), not the inner `max-w-5xl` | live-deploy: full-bleed gray field around the page |
| S1-1 persisted accent | Changing `--accent` default doesn't recolor a persisted custom accent | `themeCssVars()` re-emits persisted value inline | resolved by Decision 2 — chrome is on `--primary*`, so persisted accent only affects in-document accent; no migration needed | live-deploy: persisted custom accent → blue chrome |
| S3-5 dark token | Accept says outline "light in both themes" but `--surface-muted` is dark in dark mode | `--surface-muted` = #35363A dark | S3-5 accept reworded: rail follows the scheme (muted surface), not forced light | live-verify outline in light AND dark |
| dark shadows | S2 new chrome hardcodes light-only shadows, no dark variant | inline `0 1px 3px rgba(60,64,67,…)` literals | all elevation via `--shadow-page`/`--shadow-dropdown`/`--shadow-dialog` tokens, each with a dark variant (S1-7); S2 emits no inline shadow literal | dark-mode snapshot of dropdowns/dialogs/new-btn |
| S3-6 OfflineIndicator | Emoji pill glyph + Offline/Syncing copy unspecified | `OfflineIndicator` partial in S3-6 | S3-6 specifies a colored connection dot (`--success`/`--warning`/`--muted`) + "Offline"/"Syncing…" copy | live-verify online + offline; status bar dot+label |
| S2-1 Upload row | Upload row depends on an uploader that may not exist → indeterminate | escape hatch "if none, OUT" | S2-1 made determinate: routes to the existing "↑ Import" (`FileManager.tsx:2139`); else disabled placeholder, never silently dropped | live-verify the Upload row wires to Import or is a visible placeholder |
| S3-2 spellcheck | "Spell check → `spellcheckEnabled` toggle (exists)" — but it's a read-only owner-settings prop | `spellcheckEnabled` read-only prop | S3-2 row marked a disabled placeholder (no in-editor toggle exists) | placeholder click-through; PARTIAL list |
| border hex | S3 says chrome border `#E8EAED`, S1 retunes `--border` to `#DADCE0` | two plans, one token, two hexes | **two distinct tokens**: `--border` (#DADCE0 structural) + `--border-chrome` (#E8EAED editor rows); S3 uses `--border-chrome` | grep: S3 chrome borders = `var(--border-chrome)` |

## Decisions applied (1–8)

1. **Canonical token vocabulary** — added to plan-S1.md ("Token vocabulary
   (canonical)"); S1-7 mints all; S2/S3/S4/S5 swept; retired-names list documented.
2. **Fixed brand vs user accent** — S1-1 mints FIXED `--primary*`, points chrome at
   it, leaves `--accent` to the picker; S1-1 Failure-mode verifies a non-default
   swatch keeps blue chrome.
3. **S3-1 title save** — rewritten to use `POST /api/docs/[id]/rename` (title-only,
   body-safe); body-PUT clobber path removed.
4. **Save-status ownership** — S3-1 owns the in-flight→settled→idle STATE; S5-9 is
   COPY only; false "lifecycle already exposed" claims removed from both.
5. **Own the 7 uncovered surfaces** — S5-11 (dialog shell), S5-12 (floating
   surfaces), S5-13 (drawers + share viewer + login), S2-6 (responsive chrome);
   README artifact list + scope counts updated.
6. **One shared Dropdown, one owner** — S5-3 owns `.px-menu` + `--shadow-dropdown`;
   S2-1/S3-2/S3-3 consume; build-order tension (token in S1, shell with first
   consumer, S5-3 finalizes) documented.
7. **Font/icon load order** — faces moved into S1-8; S4 keeps the ramp/sizing/Arial/
   drop-Inter; no plan references a font the prior plan hasn't loaded.
8. **Reconcile + flag** — #18 single owner (S2-4); #21 Format painter/Zoom/Spell
   placeholders + S3-2 placeholder audit; remaining minors (S1-2 gutter container,
   S3-5 dark token, S3-6 OfflineIndicator copy, S3-2 spellcheck semantics, S2-1
   Upload row) all addressed.
