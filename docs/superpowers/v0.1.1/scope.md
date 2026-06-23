# Parchment v0.1.1 — scope tracker

> ⛔ **HOLD — scope locked, execution gated.** No item starts until the user says
> GO on Plan S1. See [README](README.md). Status legend: `TODO` · `WIP` ·
> `PARTIAL (n%)` · `DONE`. `Cov` = covered by a per-PR snapshot+axe artifact.
> `LV` = live-deploy verified.

**32 items · single tag `v0.1.1` · no deferrals.**

## Plan S1 — Color, theme tokens, surfaces ([detail](plan-S1.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S1-1 | Primary purple → Google Blue `#1A73E8` (+hover/pressed tokens) | TODO | ☐ | ☐ | |
| S1-2 | Page-outside bg `#F1F3F4` | TODO | ☐ | ☐ | |
| S1-3 | Page canvas pure white + Docs shadow | TODO | ☐ | ☐ | |
| S1-4 | Drop cream surfaces (white / `#F8F9FA`) | TODO | ☐ | ☐ | |
| S1-5 | Selection `#D2E3FC`; collab cursors accent blue + per-user hue | TODO | ☐ | ☐ | |
| S1-6 | Focus ring `2px #1A73E8` offset 2px on all focusables | TODO | ☐ | ☐ | |
| S1-7 | Token file `src/styles/tokens.css` — all colors via CSS vars | TODO | ☐ | ☐ | foundation for light/dark/system |

## Plan S2 — Global chrome ([detail](plan-S2.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S2-1 | Left sidebar → Drive shape (white, 256px, giant + New mega-menu, nav rows) | TODO | ☐ | ☐ | |
| S2-2 | Sidebar bottom cluster (avatar/name, muted lang, Help icon, sign-out) | TODO | ☐ | ☐ | |
| S2-3 | Wordmark → `#202124` 16px Google Sans semibold (+optional glyph) | TODO | ☐ | ☐ | |
| S2-4 | Drop Files-page top tab strip → nav rows in sidebar | TODO | ☐ | ☐ | ties S5-4 |
| S2-5 | Top-right user cluster (32px avatar → account menu) | TODO | ☐ | ☐ | |

## Plan S3 — Editor chrome ([detail](plan-S3.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S3-1 | Doc title bar (NEW) — icon/title/star/move/save-status/comments/history/Share/avatar | TODO | ☐ | ☐ | |
| S3-2 | Menu bar (NEW) — File/Edit/View/Insert/Format/Tools/Extensions/Help dropdowns | TODO | ☐ | ☐ | shared dropdown system; PARTIAL risk |
| S3-3 | Editor toolbar restyle (single light row, full ordering, overflow ⋯) | TODO | ☐ | ☐ | |
| S3-4 | Drop export-format text strip → File → Download | TODO | ☐ | ☐ | depends S3-2 |
| S3-5 | Outline pane redesign (light left-rail, not floating dark) | TODO | ☐ | ☐ | |
| S3-6 | Bottom status bar restyle (24px, page/word/mode/connection) | TODO | ☐ | ☐ | |

## Plan S4 — Typography + spacing ([detail](plan-S4.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S4-1 | Font stack (Google Sans/Roboto UI, Arial body, Roboto Mono code; drop Inter) | TODO | ☐ | ☐ | |
| S4-2 | Type ramp (title/subtitle/H1–6/body in pt, `#202124`/`#5F6368`) | TODO | ☐ | ☐ | md serializer round-trips unchanged |
| S4-3 | Chrome typography (14px Roboto, 20px Material Symbols Rounded) | TODO | ☐ | ☐ | |
| S4-4 | Spacing tokens (4–56 grid; rows 36px; icon btn 32×32/20px; @page 1in) | TODO | ☐ | ☐ | |

## Plan S5 — Interactions, file manager, landing ([detail](plan-S5.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| S5-1 | Hover/pressed/disabled states on every interactive element | TODO | ☐ | ☐ | |
| S5-2 | Tooltips on every icon-only control | TODO | ☐ | ☐ | |
| S5-3 | Dropdown elevation (Docs shadow, 8px radius, 36px rows) | TODO | ☐ | ☐ | |
| S5-4 | File manager Drive parity (doc/folder glyphs, sort/view, tag dot, ⋯ on hover) | TODO | ☐ | ☐ | |
| S5-5 | File-row selection states (click/double/shift/⌘/right-click) | TODO | ☐ | ☐ | |
| S5-6 | Landing `/` → `/files`; drop the centered card | TODO | ☐ | ☐ | Health via Settings→Admin |
| S5-7 | Files hero → "My Drive"/"My Files" 22px; drop subtitle | TODO | ☐ | ☐ | |
| S5-8 | Copy revisions (New mega-menu labels; drop version/tagline strings) | TODO | ☐ | ☐ | |
| S5-9 | Save-status microcopy ("All changes saved to disk" / idle "N min ago") | TODO | ☐ | ☐ | ties S3-1 |
| S5-10 | Editing-mode dropdown (Editing/Suggesting/Viewing) | TODO | ☐ | ☐ | ties S3-3 |

## Roll-up

| Plan | Items | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| S1 Color/tokens | 7 | 0 | 0 | 7 |
| S2 Global chrome | 5 | 0 | 0 | 5 |
| S3 Editor chrome | 6 | 0 | 0 | 6 |
| S4 Typography | 4 | 0 | 0 | 4 |
| S5 Interactions | 10 | 0 | 0 | 10 |
| **Total** | **32** | **0** | **0** | **32** |

## Visual-regression baselines (gate)
7 surfaces — landing redirect · files page · file list · editor idle · editor
toolbar-overflow open · share dialog open · settings→theme. Baseline committed +
updated in the PR that changes the surface.
