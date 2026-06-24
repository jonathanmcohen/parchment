# Parchment v0.1.2 — function gaps, layout fixes, chrome consolidation

```
╔══════════════════════════════════════════════════════════════════════════╗
║  🟢  GO — EXECUTING (Plan F1+F2 → L → F3–F10 → C).                         ║
║                                                                            ║
║  Plans verified via a 5-lens adversarial review (2 blocking + 5 important  ║
║  + 2 minor findings, all fixed 2026-06-24). User gave GO. One PR per item. ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## Goal
Close the gaps caught in a **live-deploy sweep** of Parchment plus direct user
feedback. Three problem classes:

- **Plan F — function gaps:** controls/menus/pages that are missing, half-wired,
  or render as dead "coming soon" stubs.
- **Plan L — layout fixes:** the editor chrome (toolbar / title / menu / status
  bar / outline / page canvas) floats in a centered card with dark gutters; make
  it the full-width, left-anchored-outline, centered-page Google-Docs layout.
- **Plan C — chrome consolidation:** the floating avatar, the dim files sub-rail,
  save-status wording, title-bar icon wiring.

**No deferrals.** Every item lands under the single **`v0.1.2`** tag. As in
v0.1.1, an item that cannot be **fully** delivered in the window is logged
`PARTIAL (n%)` **with the specific named gap** — never silently `DONE`.

## ⚠️ Deploy-state caveat (read before grading any item)
The homelab redeploy to **v0.1.1 was skipped** last session (blocked on the
1Password SSH agent), so `parchment.local.jonco.dev` was very likely still serving
**v0.1.0** during the sweep. Grounding each item against the **v0.1.1 code**
(`release/v0.1.2` branches from `main` @ `v0.1.1` = `542a2d8`) shows several
reported gaps are **already closed in code** and were stale-deploy artifacts:

| Reported gap | v0.1.1-code reality | v0.1.2 action |
|---|---|---|
| F8/L3 "status bar dropped" | `StatusBar` **is** rendered (`Editor.tsx:1577`), fully wired | only **pin** it bottom + full-width |
| F5 "Edit menu opens nothing" | Edit menu **is** populated — Undo/Redo/Select-all/Find/Find-replace (`MenuBar.tsx:89-107`) | **add** Cut/Copy/Paste; repro the "opens nothing" |
| F2 "body text grey/unreadable in dark" | `.parchment-prose { color: var(--foreground) }` is **scheme-correct** (`globals.css:2079`) | **reproduce-first**; fix the real overriding rule if any |
| F10 "Clear formatting is a stub" | **already wired** (`MenuBar.tsx:173-176`) | no change; ship Horizontal-line + Shortcuts, hide the rest |
| C2 "files column 30% opacity broken" | **no** opacity/disabled class in the rail (`FileManager.tsx:2326`) | **reproduce-first**; likely stale deploy |

**Every item whose user observation conflicts with the v0.1.1 code carries a
"reproduce-first" Step 1:** rebuild `release/v0.1.2` base, confirm the gap is real
(not a stale render), and if it's purely a deploy artifact the item collapses to
**"verify + redeploy"** — but the genuine layout/polish/wording work in the same
item is still executed and snapshot-gated. **A v0.1.1 redeploy to the homelab is a
prerequisite for trustworthy live-deploy artifacts** (see Execution model).

## Shape
**22 items** across **3 plan groups**, executed in the user's order:

| Order | Plan | Theme | Items |
|---|---|---|---|
| 1 | [F1–F2](plan-F.md) | Theme switch applies · page-body ink (unblocks visual verify) | 2 |
| 2 | [L1–L7](plan-L.md) | Layout — full-width chrome, anchored outline, centered page | 7 |
| 3 | [F3–F10](plan-F.md) | Toolbar controls · Styles merge · Edit menu · 404 · settings · share · status bar · menu audit | 8 |
| 4 | [C1–C5](plan-C.md) | Avatar home · files sub-rail · save wording · title-bar icons · transient | 5 |

F1+F2 run first because a working theme toggle + correct page ink are the
**precondition for verifying every later light/dark screenshot.** L precedes the
remaining F items because the full-width chrome stack (L1/L2/L7) is the frame the
toolbar controls (F3/F4) and status bar (F8) live in.

Tracker: **[scope.md](scope.md)** (per-item status, roll-up). Each plan file
carries the full item spec, a **Coverage check**, and **Failure-modes-verified**.
Cross-item structural decisions + the stale-deploy reconciliation are in
**[coverage-matrix.md](coverage-matrix.md)**.

## Per-PR artifact requirements
Every item PR MUST attach, in the PR body:
1. **spec path** — the `plan-X.md` anchor for the item.
2. **RED-on-base** — a Playwright **visual snapshot** of the surface in its
   current (pre-change) state on `release/v0.1.2`, proving the drift, **plus** an
   axe-core run where the surface is a11y-relevant.
3. **GREEN-on-branch** — the same visual snapshot + axe after the change, passing.
4. **live-deploy screenshot in BOTH light AND dark mode** of every restyled
   surface touched, against a deploy of the branch. The surface set:
   editor route with the toolbar / menu bar / title bar / outline / status bar
   visible, the Share dialog, Settings → Account, the 404 page, the Files page.

## Verification gate (visual regression — light + dark)
Extend the S1-0 Playwright `visual` project to cover, **each in light AND dark**:
1. editor route — idle (full chrome stack)
2. editor — toolbar full-width with font / size / color controls
3. editor — a menu dropdown open (Edit)
4. editor — outline anchored + the collapsed 40px rail
5. editor — status bar pinned bottom
6. share dialog
7. settings → Account (theme control)
8. 404 page
9. files page (folder-tree sub-rail)

9 surfaces × {light, dark} = the v0.1.2 baseline set; the v0.1.1 darwin baselines
are the pre-F1 reference. A PR that changes a surface updates that baseline in the
same PR (reviewed diff), never silently. The `visual` project stays
**controller-local** (per-platform darwin baselines); CI keeps the axe (chromium)
project only — same split as v0.1.1 (`ci.yml:130`).

## Honesty constraint
Carries the v0.1.0/v0.1.1 rule. No item flips to `DONE` until **browser-verified on
the live deploy in both light and dark.** If a surface cannot be fully matched in
the v0.1.2 window, mark it **`PARTIAL (n%)`** in [scope.md](scope.md) **with the
specific gap named** — last release shipped 6 PARTIAL items whose gaps were not
named up front; this release names every PARTIAL gap per item. Pre-identified
PARTIAL-risk items (grounded, see coverage-matrix): **F2** (may already be correct —
reproduce-first), **F3** (highlight-color picker + insert-comment need new
Tiptap/D1 logic), **F7** (workspace-name has no backing endpoint), **F9** (per-email
sharing + restricted toggle need new API + schema), **C4** (star has no persist
endpoint), **C5** (min-delay transient is small new timing logic).

## Execution model (when GO lands)
**Prerequisite:** redeploy v0.1.1 to the homelab first (unblock the 1Password SSH
agent), so live-deploy artifacts compare against the real current release, not the
stale v0.1.0. Then per-item: branch off `release/v0.1.2` → implement (TDD where
logic exists; pure restyle is snapshot-gated) → controller live-verify on a deploy
in **light AND dark** → per-PR artifacts → squash-merge → ledger. Same pipeline as
v0.1.0/v0.1.1. `release/v0.1.2` is the integration branch; at release it ff-merges
to `main` and tags `v0.1.2`, then a multi-arch publish to ghcr + homelab redeploy.
