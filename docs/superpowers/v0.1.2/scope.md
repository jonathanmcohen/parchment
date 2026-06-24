# Parchment v0.1.2 — scope tracker

> ⛔ **HOLD — scope locked, execution gated.** No code until the user replies
> "GO" on Plan F1+F2. See [README](README.md). Status legend: `TODO` · `WIP` ·
> `PARTIAL (n%)` · `DONE`. `Cov` = covered by a per-PR visual-snapshot (+axe)
> artifact. `LV` = live-deploy verified **in light AND dark**.

**22 items · single tag `v0.1.2` · no deferrals.** Order: F1+F2 → L1–L7 →
F3–F10 → C1–C5. Grounded against the v0.1.1 code (`release/v0.1.2` base = `main`
@ `v0.1.1`, `542a2d8`). Stale-deploy reconciliation in
[coverage-matrix.md](coverage-matrix.md).

## Plan F — function gaps ([detail](plan-F.md))

| ID | Item | Status | Cov | LV | Notes / pre-identified gap |
|---|---|---|---|---|---|
| F1 | Theme switch actually applies (Account select → `/api/settings/theme` + refresh) | TODO | ☐ | ☐ | wiring: backend works; the Account `<select>` (`account/page.tsx:56`) fires no onChange. Reuse `AppearanceSettings` onChange+`router.refresh()` pattern |
| F2 | Page-body ink correct in dark (always `--foreground`, never `--muted`) | TODO | ☐ | ☐ | **reproduce-first** — `.parchment-prose` is already `var(--foreground)` (scheme-correct, `globals.css:2079`). Find the real overriding rule (wrapper/HC/dyslexic) or close as stale-deploy |
| F3 | Missing toolbar controls (font list, size ±, highlight color, insert-comment) | TODO | ☐ | ☐ | **PARTIAL-risk** — 7/8 exist; gaps: font list 6→10 + "More fonts…", size −/+ chips, **highlight COLOR picker (no `setHighlightColor` today)**, **insert-comment-per-selection (collides w/ D1 sidebar model)** |
| F4 | Merge Block + Styles dropdowns into one "Styles" | TODO | ☐ | ☐ | wiring: combine `BLOCK_TYPES` select + `StylesMenu` into one control; drop "Block" label |
| F5 | Edit menu — add Cut/Copy/Paste/Paste-without-formatting | TODO | ☐ | ☐ | Edit menu is NOT empty in code (`MenuBar.tsx:89-107`); add 4 clipboard rows; repro "opens nothing"; paste-w/o-formatting has no native backing → custom strip or honest placeholder |
| F6 | Parchment-styled 404 (`not-found.tsx`) | TODO | ☐ | ☐ | new file; "404 / This page wandered off" + Back-to-home (`--primary`) + recovery search → existing `/api/search`; gate the input behind auth (search route is authed) |
| F7 | Settings ghosted sub-pages — ship-or-hide | PARTIAL-risk | ☐ | ☐ | **no half-built state.** Sub-pages render but Workspace inputs have **no backing endpoint**. Decision per coverage-matrix: ship Admin→Health (exists) + About(/whats-new, exists); Workspace-name needs a new `/api/settings/workspace` route OR disable+"v0.2" label |
| F8 | Bottom status bar restored + pinned (24px, full-width) | TODO | ☐ | ☐ | `StatusBar` already rendered+wired (`Editor.tsx:1577`); only **pin** `position:fixed; bottom:0` full-width (overlaps L3) |
| F9 | Share dialog completeness | PARTIAL-risk | ☐ | ☐ | **PARTIAL-risk** — link-side (auto-link on open, "Copy link" primary, Restricted/Anyone toggle) is in-scope; **per-email "Add people" + roles needs new API+schema** → ship the link UX, keep "Invite by email (v0.2)" as the honest placeholder; Restricted toggle needs a `mode` field decision |
| F10 | Audit "Coming soon" menu rows — ship 4, hide rest | TODO | ☐ | ☐ | ship: Insert→Horizontal line (`setHorizontalRule` exists), Help→Keyboard shortcuts (HelpMenu dialog exists). Already-wired: Format→Clear formatting. No backing → **hide**: Insert→Page number + the rest of the placeholder set |

## Plan L — layout fixes ([detail](plan-L.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| L1 | Editor toolbar full-width (sticky `top:56px`, edge-to-edge bg, centered content) | TODO | ☐ | ☐ | restyle: toolbar currently inside `mx-auto max-w-5xl` (`Editor.tsx:1418`); split bg (full-bleed) from content (centered) |
| L2 | Title bar + menu bar full-width sticky | TODO | ☐ | ☐ | restyle: title 56px + menu 32px both inside the centered column today; lift bg to full bleed, keep content centered |
| L3 | Bottom status bar full-width (with F8) | TODO | ☐ | ☐ | restyle: same full-bleed-bg/centered-content treatment; pairs with F8 pinning |
| L4 | Outline pane anchored left, not floating; 40px collapsed rail; sentence-case "Outline" | TODO | ☐ | ☐ | restyle: pane is in-flow flex child but not sticky; collapse target is 32px (→40px) + uppercase title (→sentence) |
| L5 | Page canvas fits (viewport − sidebar − outline; gutter; 816px; gutter-only h-scroll; 24px pad; verify S1-3 shadow) | TODO | ☐ | ☐ | restyle: page is flex:1 grow; `--shadow-page` confirmed present (`globals.css:729`); add gutter-only overflow + vertical pad |
| L6 | Eliminate floating-card chrome (no rounded card) | TODO | ☐ | ☐ | restyle: grounding found **no** rounded card today — the `max-w-5xl` column is flat on the `--editor-gutter` shell. Item = ensure no card residue while L1/L2/L4 reshape; mostly a verify |
| L7 | Sticky top chrome stack 136px (title 56 / menu 32 / toolbar 48), status bottom:0 | TODO | ☐ | ☐ | restyle: add `position:sticky` + z-index stack; outline + canvas start `top:136px` |

## Plan C — chrome consolidation ([detail](plan-C.md))

| ID | Item | Status | Cov | LV | Notes |
|---|---|---|---|---|---|
| C1 | Top-right floating avatar → into title bar; wire account menu | TODO | ☐ | ☐ | wiring: `UserCluster` already wired (Manage account/Sign out); `DocTitleBar` already accepts an `avatar` prop. Move `UserCluster` into the title-bar slot; drop the floating layout-topbar copy |
| C2 | Files middle column ("Import/Root/Guide/Smart folders/Tags") — fix or remove | TODO | ☐ | ☐ | **reproduce-first** — grounding found no opacity/disabled dimming in code (`FileManager.tsx:2326`); drag-drop wired. Likely stale deploy; confirm live then close or polish |
| C3 | Save wording "All changes saved to disk" → "All changes saved" + hover detail | TODO | ☐ | ☐ | text change in `saveStatusLabel` (`DocTitleBar.tsx:22`) + tooltip driven by `useConnectionState` (already imported `Editor.tsx:45`) |
| C4 | Title-bar icons (star/move/comments/history) — tooltips + working clicks | PARTIAL-risk | ☐ | ☐ | comments/history wired; **star is local-state only, no persist endpoint** → wire to existing `POST /api/docs/{id}/star` (used by FileManager) OR keep disabled+"coming soon"; add missing tooltips |
| C5 | "Saving…" transient visible 200–500ms on first edit | TODO | ☐ | ☐ | **small new logic** — add a min-visible delay to `useSaveStatus.markSaved()` so a fast save still flashes "Saving…" |

## Roll-up

| Plan | Items | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| F function gaps | 10 | 0 | 0 | 10 |
| L layout fixes | 7 | 0 | 0 | 7 |
| C chrome consolidation | 5 | 0 | 0 | 5 |
| **Total** | **22** | **0** | **0** | **22** |

## Known PARTIAL-risk items (named gaps, per the honesty constraint)
Will not flip to `DONE` while a named sub-part is a placeholder/deferred:
- **F2** — may already be correct in code; if the reported grey ink is a stale-deploy
  artifact, the item closes as "verified + redeployed", not a code change. If a real
  overriding rule exists, fix it. Named gap if unfixable in-window: the specific
  wrapper/HC interaction.
- **F3** — **highlight COLOR picker** (Tiptap highlight is toggle-only; needs a
  color attr/extension) and **insert-comment-per-selection** (D1 comments are
  sidebar threads, not inline marks). Ship font-list + size-chips; name these two as
  the PARTIAL gap if they outgrow the window.
- **F7** — **Workspace → General persistence** has no `/api/settings/workspace`
  endpoint. Ship the pages that have real backings (Health, About); the
  workspace-name field is disabled-with-label unless the endpoint ships.
- **F9** — **per-email "Add people" + role grants + Restricted/Anyone schema** is new
  feature logic (new route + table). Ship the link-side UX; per-email stays the
  honest "v0.2" placeholder.
- **C4** — **star persistence** (no editor-side star endpoint wired today). Wire to
  the existing FileManager star endpoint or keep the disabled placeholder.
- **C5** — the min-visible-delay is small new timing logic in the save state machine.

## Visual-regression baselines (gate)
9 surfaces, **each light + dark** (see [README](README.md)): editor idle · toolbar
full-width w/ controls · Edit menu open · outline anchored + collapsed rail · status
bar pinned · share dialog · settings→Account · 404 · files page. Baseline committed +
updated in the PR that changes the surface. `visual` project stays controller-local;
CI runs axe (chromium) only.
