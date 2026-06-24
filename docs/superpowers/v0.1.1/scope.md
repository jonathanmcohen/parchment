# Parchment v0.1.1 — scope tracker

> 🟢 **GO — executing.** S1→S5 in progress; user gave GO 2026-06-23.
> GO on Plan S1. See [README](README.md). Status legend: `TODO` · `WIP` ·
> `PARTIAL (n%)` · `DONE`. `Cov` = covered by a per-PR snapshot+axe artifact.
> `LV` = live-deploy verified.

**38 items (incl. S1-0 harness) · single tag `v0.1.1` · no deferrals.**

> **Revised 2026-06-23 after adversarial review** (22 blocking/important + 9 minor
> findings, all closed — see [coverage-matrix.md](coverage-matrix.md)). New items
> added: **S1-8** (font/icon face loading), **S2-6** (responsive chrome), **S5-11**
> (dialog shell), **S5-12** (floating editor surfaces), **S5-13** (secondary
> surfaces parity). All var names now follow the canonical token vocabulary in
> plan-S1.md.

## Plan S1 — Color, theme tokens, surfaces ([detail](plan-S1.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S1-0 | Visual-regression harness (7-surface `toHaveScreenshot` + S1-6 focus-ring spec) | DONE | ☑ | ☑ | playwright `visual` project; darwin baselines committed; 15 visual + axe 20 green |
| S1-1 | FIXED `--primary*` brand (chrome blue); keep `--accent` as user picker | DONE | ☑ | ☑ | chrome→--primary across 34 refs; non-default accent stays blue-chrome (#13) |
| S1-2 | Page-outside bg `#F1F3F4` (`--editor-gutter` on full-width `<main>`) | DONE | ☑ | ☑ | baseline #4 shows gray gutter |
| S1-3 | Page canvas pure white + Docs shadow (`--shadow-page`) | DONE | ☑ | ☑ | |
| S1-4 | Drop cream surfaces (white / `#F8F9FA`) | DONE | ☑ | ☑ | residue grep clean |
| S1-5 | Selection `#D2E3FC`; collab cursors accent blue + per-user hue | DONE | ☑ | ☑ | blue caret in baseline #4 |
| S1-6 | Focus ring `2px #1A73E8` offset 2px on all focusables | DONE | ☑ | ☑ | focus-ring spec 8/8 (light+dark) |
| S1-7 | Token file `src/styles/tokens.css` — full canonical vocabulary | DONE | ☑ | ☑ | mints ALL tokens; light/dark |
| S1-8 | Font + icon FACE loading (Roboto/Roboto Mono/Material Symbols) | DONE | ☑ | ☑ | self-hosted woff2, no CDN |

**Plan S1 COMPLETE (9/9 incl. S1-0).** Tokens + harness on `feat/S1-tokens`; baselines are the post-S1 reference for S2+ RED/GREEN.

## Plan S2 — Global chrome ([detail](plan-S2.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S2-1 | Left sidebar → Drive shape (white, 256px, giant + New mega-menu, nav rows) | WIP | ☐ | ☐ | code landed; consumes S5-3 shell (menus flat in S2); awaits VR baselines + live-verify |
| S2-2 | Sidebar bottom cluster (avatar/name, muted lang, Help icon, sign-out) | WIP | ☐ | ☐ | code landed; icon-only Help has aria-label/title; sign-out red-on-hover |
| S2-3 | Wordmark → `#202124` 16px Google Sans semibold (+optional glyph) | WIP | ☐ | ☐ | code landed; `--foreground` 16px semibold + glyph |
| S2-4 | Drop Files-page top tab strip → nav rows in sidebar (SOLE owner) | PARTIAL (80%) | ☐ | ☐ | strip deleted (#18); 5 views reachable (Files/Trash via route, Recents/Starred/Shared via `?view=`); REMAINDER: dedicated `/recents` `/starred` `/shared` routes (out of "no new features") |
| S2-5 | Top-right user cluster (32px avatar → account menu) | WIP | ☐ | ☐ | code landed; initial-fallback avatar (no image column); Switch account disabled placeholder; no 9-dot grid |
| S2-6 | Responsive chrome (sidebar collapse/overlay + editor chrome stack) | PARTIAL (70%) | ☐ | ☐ | sidebar drawer/overlay + hamburger + scrim + content full-width at <768px landed; REMAINDER: editor-chrome (S3 stack) narrow reflow — leans on S3-3 `⋯` overflow (not yet built) (#10) |

## Plan S3 — Editor chrome ([detail](plan-S3.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S3-1 | Doc title bar (NEW) — title via `/rename`; owns save-status STATE | TODO | ☐ | ☐ | rename endpoint (#1); state (Dec.4) |
| S3-2 | Menu bar (NEW) — 8 menus; consumes S5-3 shell | TODO | ☐ | ☐ | PARTIAL; placeholders (#21) |
| S3-3 | Editor toolbar restyle (single light row, overflow ⋯) | TODO | ☐ | ☐ | PARTIAL — Format painter/Zoom/Spell placeholders (#21) |
| S3-4 | Drop export-format text strip → File → Download | TODO | ☐ | ☐ | depends S3-2 |
| S3-5 | Outline pane redesign (light left-rail, not floating dark) | TODO | ☐ | ☐ | |
| S3-6 | Bottom status bar restyle (24px, page/word/mode/connection) | TODO | ☐ | ☐ | |

## Plan S4 — Typography + spacing ([detail](plan-S4.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S4-1 | Font stack RAMP-side (drop Inter, Arial body, theme.ts) — faces in S1-8 | TODO | ☐ | ☐ | |
| S4-2 | Type ramp (title/subtitle/H1–6/body in pt; ink `--foreground`/`--muted`) | TODO | ☐ | ☐ | md serializer round-trips unchanged |
| S4-3 | Chrome typography (14px Roboto, 20px Material Symbols) — font loaded by S1-8 | TODO | ☐ | ☐ | |
| S4-4 | Spacing tokens (4–56 grid; rows 36px; icon btn 32×32/20px; @page 1in) | TODO | ☐ | ☐ | |

## Plan S5 — Interactions, file manager, landing ([detail](plan-S5.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S5-1 | Hover/pressed/disabled states on every interactive element | TODO | ☐ | ☐ | |
| S5-2 | Tooltips on every icon-only control | TODO | ☐ | ☐ | |
| S5-3 | Dropdown elevation — OWNER of shared `.px-menu` shell + `--shadow-dropdown` | TODO | ☐ | ☐ | Decision 6 (#16) |
| S5-4 | File manager Drive parity (doc/folder glyphs, sort/view, tag dot, ⋯ on hover) | TODO | ☐ | ☐ | refs S2-4 strip delete |
| S5-5 | File-row selection states (click/double/shift/⌘/right-click) | TODO | ☐ | ☐ | |
| S5-6 | Landing `/` → `/files`; drop the centered card | TODO | ☐ | ☐ | Health via Settings→Admin |
| S5-7 | Files hero → "My Drive"/"My Files" 22px; drop subtitle | TODO | ☐ | ☐ | |
| S5-8 | Copy revisions (New mega-menu labels; drop version/tagline strings) | TODO | ☐ | ☐ | |
| S5-9 | Save-status COPY only ("All changes saved to disk" / idle "N min ago") | TODO | ☐ | ☐ | STATE = S3-1 (Dec.4) |
| S5-10 | Editing-mode dropdown (Editing/Suggesting/Viewing) | TODO | ☐ | ☐ | ties S3-3 |
| S5-11 | Modal dialog shell → Docs (`.parchment-dialog`, ShareDialog + 10 dialogs) | TODO | ☐ | ☐ | makes VR #6 owned (#5/#6) |
| S5-12 | Floating editor surfaces (BubbleMenu/SlashMenu/LinkPopover) → Docs popover | TODO | ☐ | ☐ | (#11) |
| S5-13 | Secondary surfaces parity (comments + version drawers, /share, /login) | TODO | ☐ | ☐ | PARTIAL risk (#7/#8/#9) |

## Roll-up

| Plan | Items | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| S1 Color/tokens + faces + harness | 9 | 9 | 0 | 0 |
| S2 Global chrome | 6 | 4 | 2(partial) | 0 |
| S3 Editor chrome | 6 | 0 | 0 | 6 |
| S4 Typography | 4 | 0 | 0 | 4 |
| S5 Interactions + surfaces | 13 | 0 | 0 | 13 |
| **Total** | **38** | **9** | **0** | **29** |

**Known PARTIAL-risk items** (will not flip to DONE while a sub-part is a
placeholder/deferred): S2-4 (routeless views), **S2-6** (editor-chrome reflow),
S3-2 (menu placeholders), **S3-3** (Format painter/Zoom/Spell-check placeholders),
**S5-13** (the two large drawers). S4-3 inherits S3-2's PARTIAL for menu-bar type.

## Visual-regression baselines (gate)
7 surfaces — landing redirect · files page · file list · editor idle · editor
toolbar-overflow open · **share dialog open (now owned by S5-11)** · settings→theme.
Baseline committed + updated in the PR that changes the surface. The additional
per-PR live-deploy artifact surfaces (comments/version drawers, floating editor
menus, public share viewer, login) are owned by S5-11/12/13 + S3-5 (see README).
