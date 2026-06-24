# Parchment v0.1.2 — coverage matrix

Cross-item decisions, the stale-deploy reconciliation, and the PARTIAL-risk audit.
Grounded by a 6-cluster code investigation against the v0.1.1 code (`release/v0.1.2`
= `main` @ `v0.1.1`, `542a2d8`). Companion to [scope.md](scope.md) +
[README](README.md).

## A. Stale-deploy reconciliation (the load-bearing finding)
The homelab redeploy to v0.1.1 was **skipped** last session (1Password SSH agent
locked), so the live sweep almost certainly ran against the **v0.1.0** deploy.
Grounding each reported gap against the v0.1.1 **code** shows several are already
closed — they are stale-deploy artifacts, not code gaps:

| Item | User report (from sweep) | v0.1.1-code reality (file:line) | Reconciled action |
|---|---|---|---|
| F2 | dark body text grey/unreadable | `.parchment-prose { color: var(--foreground) }` — scheme-correct (`globals.css:2079`) | reproduce-first; fix real override OR close as artifact |
| F5 | "Edit menu opens nothing" | Edit menu populated: Undo/Redo/Select-all/Find/Find-replace (`MenuBar.tsx:89-107`) | reproduce-first; ADD Cut/Copy/Paste only |
| F8 / L3 | "status bar dropped in v0.1.1" | `StatusBar` rendered + fully wired (`Editor.tsx:1577`, `StatusBar.tsx:1-89`) | only PIN it (no restore) |
| F10 | "Clear formatting is a stub" | already wired `unsetAllMarks().clearNodes()` (`MenuBar.tsx:173`) | no change; ship Horizontal-line + Shortcuts |
| C2 | files column "~30% opacity broken" | no opacity/disabled class; drag-drop wired (`FileManager.tsx:2326`) | reproduce-first; likely artifact |

**Release prerequisite:** redeploy v0.1.1 to the homelab **before** collecting any
live-deploy artifacts, so RED/GREEN compares against the real current release. Each
reconciled item carries a **reproduce-first Step 1**; an item that is purely a stale-
deploy artifact collapses to "verify + redeploy" but still executes any genuine
layout/wording work in the same item.

## B. Item classification (change_type, grounded)
| Type | Items | Meaning |
|---|---|---|
| Pure restyle / CSS | F2, L1, L2, L4, L5, L6, L7, (C2 verify) | no logic; snapshot-gated |
| Wiring (reuse existing handlers/endpoints) | F1, F4, F10, C3 | connect existing pieces (F4 also adds one `DEFAULT_STYLES` data entry: Subtitle) |
| Layout reposition | F8/L3 | pin the existing status bar |
| New view over existing endpoints | F6 (404 → `/api/search`) | new file, no new backend |
| Ship-or-hide audit | F7, F10 | no half-built state |
| Small new logic (ships fully, not PARTIAL) | F5 (clipboard Cut/Copy/Paste + paste-without-formatting strip handler), C1 (theme-submenu UI reusing F1's path), C5 (min-visible save delay) | new but bounded; lands complete |
| New feature logic (PARTIAL-risk, named) | F3 (highlight-color, insert-comment), F7 (workspace persist), F9 (per-email + Restricted), C4 (star persist) | scoped + honestly flagged |

## C. PARTIAL-risk audit (named gaps — the v0.1.1 lesson applied)
v0.1.1 shipped 6 PARTIAL items whose gaps weren't named up front. v0.1.2 names each
PARTIAL gap **before** execution:

| Item | Named gap | Resolution path | If it can't land in-window |
|---|---|---|---|
| **F2** | reported grey ink not in code | reproduce-first; fix override if real | close as stale-deploy artifact (verified + redeployed) |
| **F3** | highlight COLOR picker (no `setHighlightColor`); insert-comment-per-selection (D1 collision) | add highlight color attr/extension; reuse D1 create flow | disabled placeholders for those two; ship font-list + size-chips; `F3 PARTIAL (n%)` |
| **F7** | Workspace→General has no `/api/settings/workspace` | add minimal GET/PUT route (name only) | disable the field + "Coming in v0.2"; `F7 PARTIAL` |
| **F9** | per-email "Add people" + roles + Restricted enforcement need new route + schema field | ship link-side UX (auto-link, Copy-link, toggle UI) | per-email stays "v0.2" placeholder; Restricted enforcement named; `F9 PARTIAL` |
| **C4** | star has no editor-side persist | reuse `POST /api/docs/{id}/star` (FileManager's) | keep disabled "coming soon"; `C4 PARTIAL` |
| **C5** | min-visible "Saving…" delay is new timing | add a floor in `markSaved()`, TDD | (small; expected to land) |

**Rule:** none of these flips to `DONE` while its named sub-part is a placeholder.

## D. Cross-item dependencies + shared decisions
1. **F1 ↔ C1 — one theme path, two entry points.** The Settings→Account theme control
   (F1) and the title-bar avatar's Theme submenu (C1) both call the existing
   `PUT /api/settings/theme` + `router.refresh()`. Build F1 first; C1 reuses it.
2. **F8 ↔ L3 — one PR.** Pinning the status bar full-width is the same change; do them
   together.
3. **L1/L2/L3 — shared "full-bleed bg, centered content" pattern.** Lift each chrome
   row out of the `max-w-5xl` clamp (bg bleeds), wrap content in a centered inner div.
   L7 ties them into the sticky 136px stack; L4's outline uses `top:136px`.
4. **C3 ↔ C5 — shared save-status machine.** C3 changes the wording, C5 changes the
   timing; coordinate so the 5-min idle is unaffected; test together.
5. **F3 / F4 live in the L1 toolbar.** Sequence the toolbar layout (L1) before the
   toolbar-content items (F3 font/size controls, F4 Styles merge) so they land in the
   final frame.
6. **F-plan menu items reuse the v0.1.1 `Menu`/`.px-menu` primitive** (S3-2/S5-3) — F5
   (Edit rows), F10 (Insert/Help rows) add config, not a new dropdown component.
7. **Token + i18n discipline (all plans):** colors via S1 vars (`--primary`/`--surface`/
   `--border-chrome`/`--foreground`/`--editor-gutter`/`--shadow-page`); copy via S5-9
   i18n keys. Grep every new/changed file for hex literals (must be zero).

## E. Execution order (user-specified)
**F1 + F2** (theme + page ink — unblocks light/dark verification) → **L1–L7** (the
full-width frame, incl. F8/L3 status pin) → **F3–F10** (toolbar controls, Styles merge,
Edit menu, 404, settings, share, menu audit) → **C1–C5** (avatar, files rail, save
wording, title-bar icons, transient). Within L, do L1/L2/L7 (sticky stack) before
L4/L5/L6 (outline/page/card) so the offsets are settled.

## F. Verification gate (visual regression — light + dark)
9 surfaces × {light, dark}: editor idle · toolbar full-width w/ controls · Edit menu
open · outline anchored + collapsed rail · status bar pinned · share dialog · settings→
Account · 404 · files page. The v0.1.1 darwin baselines are the pre-F1 reference. New
this release: the **dark** variants + the **404** and **settings→Account** + **Edit-menu-
open** surfaces. `visual` project stays controller-local; CI runs axe (chromium) only
(`ci.yml:130`). A surface-changing PR updates its baseline in the same reviewed diff.

## G. Out of scope (explicitly not in v0.1.2)
- Per-email sharing backend + grants table (F9 — v0.2).
- A real zoom control / Format painter / spell-check toggle (v0.1.1 placeholders stay).
- Workspace settings beyond the name field (F7 — only the named field, if shipped).
- Any change to the export/voice/AI/citation/collab feature logic (re-surfaced only).
- The mobile `--page-scale` responsive path (S2-6, v0.1.1) — L must not regress it.
