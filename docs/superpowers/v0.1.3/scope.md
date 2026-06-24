# Parchment v0.1.3 — scope tracker

> ⛔ **HOLD — scope locked, execution gated.** No code until "GO" on CF1+CF6. See
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
| CF1 🌐 | Theme save fails on deploy ("Could not save appearance") | TODO | ☐ | ☐ | reproduce-first: `curl -v PUT /api/settings/theme` with session cookie → see 401 vs 200. Primary hypothesis: `secure: env.nodeEnv==='production'` cookie behind Caddy (`session.ts:37`) OR NODE_ENV not set on deploy. **Probe决定 the real cause** before fixing; add e2e toggle+persist test |
| CF6 | Account name/email render empty (real code bug, repro local) | TODO | ☐ | ☐ | **NOT deploy-only.** `account/page.tsx` never calls `requireUser()` + inputs have no `defaultValue` → empty. Fix: `requireUser()` + `defaultValue={user.name/email}`. e2e test loads page + asserts populated. Likely same auth family as CF1 |
| CF2 🌐 | Settings ghosted sub-pages — ship-or-hide per page | PARTIAL-risk | ☐ | ☐ | code renders functional; "ghosted" must be reproduced (CSS dim vs auth-empty). **Ship:** Workspace-name (done), Admin Audit+Health (wired), Developer **PATManager (NEW UI, /api/auth/pat exists)**, Security **change-password + sessions (2 NEW routes)**, About **+build-SHA**. **HIDE:** Notifications (remove from `_nav.tsx`). PARTIAL gap = the new routes/UI/SHA |
| CF3 🌐 | Files left rail ~30% opacity on deploy | TODO | ☐ | ☐ | **code is CLEAN** (`FileManager.tsx:2326` opacity:1; only Import dims while importing). Reproduce-first on deploy BLOCKING — if dim, it's a cascade/proxy thing not the component → **REMOVE the rail** (cite JSX) unless 1-file fix; if not dim post-redeploy, close verified-with-screenshot |
| CF4 🌐 | Share URL `0.0.0.0:3000` not public host | TODO | ☐ | ☐ | **confirmed code bug.** `shareUrl` uses `req.nextUrl.origin` (`shares/route.ts:11`). Fix: `PUBLIC_URL` env (→ `env.publicUrl`, default localhost), sweep ALL req-origin URL builders; doc in README+compose. = LT7-3 |
| CF5 🌐 | Double avatar (topbar + title-bar) | PARTIAL-risk | ☐ | ☐ | **code gates correctly** (`TopbarUserCluster.tsx:32` returns null on `/d/`). Reproduce-first: count avatars per route. If double on deploy → likely a **locale/proxy pathname prefix** (`/en/d/…`) breaking the string guard → make it locale-tolerant. PARTIAL gap = the routing root-cause |
| CF7 | Editing/Suggesting/Viewing mode dropdown | TODO | ☐ | ☐ | **code SHIPPED** (`Toolbar.tsx:1303-1333`, right-aligned `margin-inline-start:auto`). Reproduce-first DOM probe — if present on deploy, close verified; if missing, runtime issue. = LT1-5 |

## Plan L — layout drift (7 tiers) ([detail](plan-L.md))

### LT1 — high-impact
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT1-1 🌐 | Kill 24px white sliver above title bar (flush to top) | TODO | ☐ | ☐ | shell `padding:2rem` pushes the stack down; cancel with `-2rem` on `.parchment-chrome-stack` / titlebar |
| LT1-2 | Compress outline→page gutter (page up to 816px) | TODO | ☐ | ☐ | outline 256→220 (LT2-2) widens gutter; page re-centers via `mx-auto` |
| LT1-3 | Toolbar overflow `⋯` chip styling | PARTIAL-risk | ☐ | ☐ | overflow button EXISTS + works (`Toolbar.tsx:1289`); gap is the chip *look* (pill+border) — CSS-only |
| LT1-4 | Vertical 1px separators between toolbar groups | TODO | ☐ | ☐ | **already exist** (`.parchment-toolbar-sep`, 21 sites) — verify visible, likely a confirm not a change |
| LT1-5 | Mode dropdown toolbar-right (= CF7) | TODO | ☐ | ☐ | **already shipped** (`Toolbar.tsx:1308`, right-aligned). Covered by CF7 |

### LT2 — page + outline
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT2-1 | Page top margin 120→96px | TODO | ☐ | ☐ | `.parchment-canvas-gutter` padding-top 24→0 (`globals.css:768`) |
| LT2-2 | Outline width 256→220px | TODO | ☐ | ☐ | `.parchment-outline` width/min/max 256→220 (`:1926`) |
| LT2-3 | Outline chevron 8px right pad | TODO | ☐ | ☐ | `.parchment-outline-toggle` right 6→8px (`:1951`) |
| LT2-4 | Outline-top == page-top | PARTIAL-risk | ☐ | ☐ | already ~2px off; optional header-padding tweak |
| LT3-1 | Title-bar left cluster spacing 12/16/24px | PARTIAL-risk | ☐ | ☐ | CSS+JSX; values terse, confirm against design |
| LT3-2 | Save-status 13px medium | TODO | ☐ | ☐ | `.parchment-titlebar-savestatus` font 400 12→500 13 (`:496`) |
| LT3-3 | Doc icon 32px | TODO | ☐ | ☐ | **already 32px** (`:444`) — confirm; glyph 24px inside |
| LT3-4 | Title Google Sans 18px semibold | TODO | ☐ | ☐ | `.parchment-titlebar-title` 400→600 (`:458`) |
| LT3-5 | Menu bar 24px left pad + 14px + gaps | TODO | ☐ | ☐ | `.parchment-menubar-inner` padding `0 8px`→`0 8px 0 24px` (`:537`) |
| LT3-6 | Title-bar right cluster 8px + 16px before Share | PARTIAL-risk | ☐ | ☐ | `.parchment-titlebar-share` margin-left; confirm 8 vs 16 |

### LT4 — global sidebar
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT4-1 | Active-row pill bg `#E8F0FE` | TODO | ☐ | ☐ | **already `--primary-surface`** (`NavRow.tsx:38`) — confirm on deploy (= LT6-1) |
| LT4-2 | Icon-to-text baseline align | PARTIAL-risk | ☐ | ☐ | Material Symbols baseline drift; `align-middle`/`leading-none`; test Safari+Chrome |
| LT4-3 | Pin bottom cluster to viewport bottom (kill 150px gap) | PARTIAL-risk | ☐ | ☐ | `justify-between` / `mt-auto` restructure; risk to other alignments |
| LT4-4 | +New width ~220px | TODO | ☐ | ☐ | `NewMenu.tsx:97` min-w-[224px]→w-[220px] |
| LT4-5 | Bottom-cluster 12px row density | PARTIAL-risk | ☐ | ☐ | `layout.tsx:85` gap-1→gap-3 + child padding audit |

### LT5 — bottom status bar
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT5-1 | Height 32→24px | TODO | ☐ | ☐ | **already 24px** (`:987`) — confirm (stale-deploy candidate) |
| LT5-2 | Mode indicator before connection dot | PARTIAL-risk | ☐ | ☐ | NEW: thread mode state → StatusBar prop |
| LT5-3 | Word-count "116 words" default; chars in modal | PARTIAL-risk | ☐ | ☐ | StatusBar default words-only; chars move to Word-count modal (modal elsewhere) |
| LT5-4 | 24px L/R padding | TODO | ☐ | ☐ | `.parchment-status-inner` padding 16→24 (`:1003`) |

### LT6 — files page
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT6-1 | Active row pill `#E8F0FE` (= LT4-1) | PARTIAL-risk | ☐ | ☐ | rows use `--selection-bg`; switching to `--primary-surface` changes selected-semantics across list/grid/details + contrast |
| LT6-2 | Row hover `#F1F3F4`/`#28292C` | TODO | ☐ | ☐ | add `--surface-hover` hover to the all-view row (`FileManager.tsx:1690`) |
| LT6-3 | Sort-chip restyle (light/dark) | PARTIAL-risk | ☐ | ☐ | scheme-aware border/bg; confirm exact target colors |
| LT6-4 | List/Grid/Details active contrast | TODO | ☐ | ☐ | **already `--primary-surface`** (`:656`) — confirm AA |
| LT6-5 | Date column left-align fixed-width | TODO | ☐ | ☐ | add `w-24` fixed width (`FileManager.tsx:1626`) |

### LT7 — share dialog
| ID | Item | Status | Repro | LV | Notes |
|---|---|---|---|---|---|
| LT7-1 | Full URL select-all-on-click or hide | PARTIAL-risk | ☐ | ☐ | `.parchment-share-list-url` static (`:462`); add Selection-API select-all (execCommand deprecated) |
| LT7-2 | Collapse two Copy buttons to ONE | PARTIAL-risk | ☐ | ☐ | remove per-row Copy (`:472`), keep the primary "Copy link"; existing-links → status + Revoke only |
| LT7-3 | Share URL fix (= CF4) | TODO | ☐ | ☐ | client uses API `url`; the fix is backend CF4 (PUBLIC_URL) |

## Roll-up

| Plan | Items | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| CF carry-forward | 7 | 0 | 0 | 7 |
| L layout (7 tiers) | 32 | 0 | 0 | 32 |
| **Total (line items)** | **39** | **0** | **0** | **39** |

*36 unique deliverables (CF7=LT1-5, CF4=LT7-3, LT6-1=LT4-1 are cross-refs).*

## Pre-identified PARTIAL-risk (named gaps)
CF2 (Security `/api/auth/password` + `/api/auth/sessions`, Developer PATManager UI, About
build-SHA), CF5 (locale/proxy pathname guard), LT1-3, LT2-4, LT3-1, LT3-6, LT4-2, LT4-3,
LT4-5, LT5-2, LT5-3, LT6-1, LT6-3, LT7-1, LT7-2.

## Already-correct-in-code (stale-deploy candidates — reproduce-first decides)
CF3 (rail opacity), CF5/CF7 gating+dropdown, LT1-4, LT1-5, LT3-3, LT4-1, LT5-1, LT6-4.
**Do NOT close any on the code-read — require a live-deploy screenshot (the C2 lesson).**

## Deploy-surfaced (🌐 — local verify cannot catch)
CF1, CF2, CF3, CF4, CF5, LT1-1, LT7-3.
