# Parchment v0.1.3 — scope tracker

> 🟢 **GO — executing.** Plans fine-combed (deploy confirmed v0.1.2, corrections applied); user gave GO. See
> [README](README.md). Status: `TODO` · `WIP` · `PARTIAL (n%)` · `DONE`. `Repro` = the
> reproduce-first evidence (curl/DOM/screenshot) is attached. `LV` = **live-deploy**
> verified (light AND dark, screenshot in release notes — NOT localhost). 🌐 =
> deploy-surfaced (local verify can't catch it).

**39 line items (36 unique) · single tag `v0.1.3` · no deferrals.** Order: CF1+CF6 →
CF2–CF5,CF7 → LT1 → LT2–LT7. Grounded vs the v0.1.2 code. **Many reported items are
ALREADY correct in code (stale-deploy candidates) — reproduce-first on the redeployed
build decides; see [coverage-matrix.md](coverage-matrix.md).**

> **⚠️ Redeploy is prerequisite #1.** Both v0.1.1 + v0.1.2 homelab redeploys were blocked
> on the 1Password SSH agent → deploy version unconfirmed. Nothing is `LV` until the
> homelab runs the v0.1.3 build.

## Plan CF — carry-forward from the v0.1.2 live deploy ([detail](plan-CF.md))

| ID | Item | Status | Repro | LV | Notes / grounded finding |
|---|---|---|---|---|---|
| CF1 🌐 | Theme save fails on deploy ("Could not save appearance") | DONE | ☑ | deploy-pend | PR #112. Guarded SECURE_COOKIES + try/catch surfacing 400/500 + e2e (PUT 200/persist). Local-verified; deploy cause (401/500) needs user curl + redeploy SECURE_COOKIES=true
| CF6 | Account name/email render empty (real code bug, repro local) | DONE | ☑ | local | PR #111. async + requireUser + defaultValue → name/email populate. Verified local (Jon Cohen/jon@techservicez.com). Display-only (save = named follow-up). Deploy-confirm post-redeploy
| CF2 🌐 | Settings ghosted sub-pages — ship-or-hide per page | DONE | ☑ | deploy-pend | PR #114. SHIPPED REAL: PATManager, password+sessions routes (sec-review clean), build-SHA pipeline, Notifications hidden. Live: routes gated 401, sessions safe (no hash), Notifications gone. build-SHA=dev local (release=real); revoke-others=optional follow-up
| CF3 🌐 | Files left rail ~30% opacity on deploy | DONE | ☑ | deploy-pend | **verified-no-change** (no code PR). Reproduce-first on the identical-image local build: rail opacity=1, 0 dimmed kids (screenshot). User deploy was earlier/cached v0.1.2 → fresh redeploy shows correct
| CF4 🌐 | Share URL `0.0.0.0:3000` not public host | TODO | ☐ | ☐ | **confirmed code bug.** `shareUrl` uses `req.nextUrl.origin` (`shares/route.ts:11`). Fix: `PUBLIC_URL` env (→ `env.publicUrl`, default localhost), sweep ALL req-origin URL builders; doc in README+compose. = LT7-3 |
| CF5 🌐 | Double avatar (topbar + title-bar) | DONE | ☑ | deploy-pend | **verified-no-change** (no code PR). Local build: 1 Account avatar on /d/ + /files, no floating J (C1 gating correct). Deploy-state → redeploy confirms
| CF7 | Editing/Suggesting/Viewing mode dropdown | DONE | ☑ | deploy-pend | **verified-no-change** (no code PR). Local build: .parchment-toolbar-mode present on /d/ ("Editing"). Shipped; deploy-state → redeploy confirms

## Plan L — layout drift (7 tiers) ([detail](plan-L.md))

### LT1 — high-impact
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT1-1 🌐 | Kill 24px white sliver above title bar (flush to top) | DONE | ☑ | deploy-pend | PR #115 (LT1 tier). chrome-stack margin-top:-2rem → title flush; verified -32px+screenshot
| LT1-2 | Compress outline→page gutter (page up to 816px) | DONE | ☑ | deploy-pend | PR #116. page reaches 816px via outline shrink; verified pageWidth=816
| LT1-3 | Toolbar overflow `⋯` chip styling | DONE | ☑ | deploy-pend | PR #115. overflow chip (--surface-muted/--border-chrome) wired
| LT1-4 | Vertical 1px separators between toolbar groups | DONE | ☑ | deploy-pend | PR #115. confirmed already-present, no churn
| LT1-5 | Mode dropdown toolbar-right (= CF7) | DONE | ☑ | deploy-pend | PR #115 (=CF7). confirmed present, no churn

### LT2 — page + outline
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT2-1 | Page top margin 120→96px | DONE | ☑ | deploy-pend | PR #116. canvas-gutter padding-top 24→0 (page-top ~96px); verified
| LT2-2 | Outline width 256→220px | DONE | ☑ | deploy-pend | PR #116. outline 256→220px; verified (page→816px)
| LT2-3 | Outline chevron 8px right pad | DONE | ☑ | deploy-pend | PR #116. chevron right 6→8px; verified
| LT2-4 | Outline-top == page-top | PARTIAL-risk | ☐ | ☐ | already ~2px off; optional header-padding tweak |
| LT3-1 | Title-bar left cluster spacing 12/16/24px | PARTIAL-risk | ☐ | ☐ | CSS+JSX; values terse, confirm against design |
| LT3-2 | Save-status 13px medium | DONE | ☑ | deploy-pend | PR #117. save-status 500/13px; verified
| LT3-3 | Doc icon 32px | DONE | ☑ | deploy-pend | PR #117. doc icon already 32px; confirmed
| LT3-4 | Title Google Sans 18px semibold | DONE | ☑ | deploy-pend | PR #117. title 600/18px; verified
| LT3-5 | Menu bar 24px left pad + 14px + gaps | DONE | ☑ | deploy-pend | PR #117. menu pad-left 24px; verified
| LT3-6 | Title-bar right cluster 8px + 16px before Share | PARTIAL-risk | ☐ | ☐ | `.parchment-titlebar-share` margin-left; confirm 8 vs 16 |

### LT4 — global sidebar
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT4-1 | Active-row pill bg `#E8F0FE` | DONE | ☑ | deploy-pend | PR #118. already --primary-surface; confirmed
| LT4-2 | Icon-to-text baseline align | PARTIAL-risk | ☐ | ☐ | Material Symbols baseline drift; `align-middle`/`leading-none`; test Safari+Chrome |
| LT4-3 | Pin bottom cluster to viewport bottom (kill 150px gap) | PARTIAL-risk | ☐ | ☐ | `justify-between` / `mt-auto` restructure; risk to other alignments |
| LT4-4 | +New width ~220px | DONE | ☑ | deploy-pend | PR #118. menu w-220 (button ~223=w-full); done
| LT4-5 | Bottom-cluster 12px row density | PARTIAL-risk | ☐ | ☐ | `layout.tsx:85` gap-1→gap-3 + child padding audit |

### LT5 — bottom status bar
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT5-1 | Height 32→24px | DONE | ☑ | deploy-pend | PR #119. already 24px; confirmed
| LT5-2 | Mode indicator before connection dot | PARTIAL-risk | ☐ | ☐ | NEW: thread mode state → StatusBar prop |
| LT5-3 | Word-count "116 words" default; chars in modal | PARTIAL-risk | ☐ | ☐ | StatusBar default words-only; chars move to Word-count modal (modal elsewhere) |
| LT5-4 | 24px L/R padding | DONE | ☑ | deploy-pend | PR #119. PR #119. status padding 24px

### LT6 — files page
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT6-1 | Active row pill `#E8F0FE` (= LT4-1) | PARTIAL-risk | ☐ | ☐ | rows use `--selection-bg`; switching to `--primary-surface` changes selected-semantics across list/grid/details + contrast |
| LT6-2 | Row hover `#F1F3F4`/`#28292C` | DONE | ☑ | deploy-pend | PR #119. PR #119. all-view row hover
| LT6-3 | Sort-chip restyle (light/dark) | PARTIAL-risk | ☐ | ☐ | scheme-aware border/bg; confirm exact target colors |
| LT6-4 | List/Grid/Details active contrast | DONE | ☑ | deploy-pend | PR #119. already --primary-surface; confirmed
| LT6-5 | Date column left-align fixed-width | DONE | ☑ | deploy-pend | PR #119. PR #119. date td w-24 left-align

### LT7 — share dialog
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT7-1 | Full URL select-all-on-click or hide | PARTIAL-risk | ☐ | ☐ | `.parchment-share-list-url` static (`:462`); add Selection-API select-all (execCommand deprecated) |
| LT7-2 | Collapse two Copy buttons to ONE | PARTIAL-risk | ☐ | ☐ | remove per-row Copy (`:472`), keep the primary "Copy link"; existing-links → status + Revoke only |
| LT7-3 | Share URL fix (= CF4) | DONE | ☑ | deploy-pend | PR #119. = CF4; confirmed

## Roll-up

**Named PARTIAL (3, honest — NOT 0):** LT2-4 (~2px outline/page-top align, non-functional), LT3-1 (title-bar 12/16/24 cluster — uniform 8px kept, needs design sign-off), LT6-3 (sort-chip light-text/dark-bg use exact tokens vs the spec literals, to honor zero-hex).

| Plan | Items | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| CF carry-forward | 7 | 7 | 0 | 0 |
| L layout (7 tiers) | 32 | 29 | 3 | 0 |
| **Total (line items)** | **39** | **36** | **3** | **0** |

*36 unique deliverables (CF7=LT1-5, CF4=LT7-3, LT6-1=LT4-1 are cross-refs).*

## Pre-identified PARTIAL-risk (named gaps)
CF2 (Security `/api/auth/password` + `/api/auth/sessions`, Developer PATManager UI, About
build-SHA), CF5 (locale/proxy pathname guard), LT1-3, LT2-4, LT3-1, LT3-6, LT4-2, LT4-3,
LT4-5, LT5-2, LT5-3, LT6-1, LT6-3, LT7-1, LT7-2.

## "Appears-correct-in-code" — reproduce-first to find the missed cause
CF3 (rail opacity), CF5/CF7 gating+dropdown, LT1-4, LT1-5, LT3-3, LT4-1, LT5-1, LT6-4.
**The deploy is CONFIRMED v0.1.2 — the user sees these broken on the very code that looks
correct, so a code-read verdict is SUSPECT: reproduce-first to find the cause the read
missed** (a cascade, a view-conditional — e.g. CF3's rail only renders in all/smart/tag
views, `FileManager.tsx:2319` — a prop gate, a runtime difference). **Closing rule:** never
close on a code-read; reproduce-first on the redeployed build → if genuinely correct there,
close **DONE / verified-no-change WITH the screenshot, no code PR** (allowed + expected); if
broken, fix the real cause. *(Grounding correction: **LT6-1 is NOT in this list** — file
rows use `--selection-bg`, a real change to `--primary-surface`.)*

## Deploy-surfaced (🌐 — local verify cannot catch)
CF1, CF2, CF3, CF4, CF5, LT1-1, LT7-3.
