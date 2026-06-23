# Parchment v0.1.1 — Google-Docs visual parity

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ⛔  HOLD — SCAFFOLD ONLY. NO IMPLEMENTATION.                              ║
║                                                                            ║
║  Scope is locked but execution is gated. Do NOT branch a feature, write    ║
║  code, or open a PR until the user replies "GO" on Plan S1.                ║
║  Banner is removed (replaced with "🟢 GO — Plan S1") only on that signal.  ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## Goal
Make Parchment **look like Google Docs.** The functional surface already shipped
in v0.1.0 — this release is **pure visual + interaction polish** to close the
Google-Docs-parity gap surfaced by a live-deploy style audit on
`parchment.local.jonco.dev`.

- **No new features.** Restyle, re-layout, re-token — nothing that adds capability.
- **No deferrals.** Every item lands under the single **`v0.1.1`** tag.
- Source of the audit: the running deploy at `https://parchment.local.jonco.dev`.

## Shape
**32 items** across **5 plan groups (S1–S5)**, executed in order:

| Order | Plan | Theme | Items |
|---|---|---|---|
| 1 | [S1](plan-S1.md) | Color, theme tokens, surfaces | 7 |
| 2 | [S2](plan-S2.md) | Global chrome (nav rails, top bar, sidebar) | 5 |
| 3 | [S3](plan-S3.md) | Editor chrome (title bar, menu bar, toolbar) | 6 |
| 4 | [S4](plan-S4.md) | Typography + spacing | 4 |
| 5 | [S5](plan-S5.md) | Interactions, file manager polish, landing | 10 |

S1 (tokens) is the foundation — every later plan consumes its CSS vars. Order is
mandatory: tokens → sidebar → editor chrome → type → polish.

Tracker: **[scope.md](scope.md)** (per-item status, roll-up). Each plan file
carries the full item spec, a **Coverage check**, and **Failure-modes-verified**.

## Per-PR artifact requirements
Every item PR MUST attach, in the PR body:
1. **spec path** — the `plan-Sx.md` anchor for the item.
2. **RED-on-main** — axe-core run + Playwright **visual snapshot** of the surface
   in its current (pre-change) state, proving the gap exists.
3. **GREEN-on-branch** — the same axe + visual snapshot after the change, passing.
4. **live-deploy screenshot** of every restyled surface touched, taken against a
   deploy of the branch. The full surface set to cover across the release:
   landing redirect, files page, file list, editor route at idle, editor with a
   toolbar dropdown open, comments drawer open, version-history drawer, outline
   pane open, and every menu/dropdown menu.

## Verification gate (visual regression)
Add Playwright **visual-regression snapshots** for the **7 main surfaces**, each
compared per-PR against a committed baseline:
1. landing redirect (`/` → `/files`)
2. files page
3. file list
4. doc editor — idle
5. editor with toolbar overflow (`⋯`) open
6. share dialog open
7. settings → theme

A PR that changes a surface updates that baseline in the same PR (reviewed diff),
never silently.

## Honesty constraint
If a surface cannot be **fully** Google-Docs-matched within the v0.1.1 window
(e.g. the menu-bar dropdown system needs new shared components that outgrow one
item), mark it **`PARTIAL`** in [scope.md](scope.md) with the **percent shipped**
and what remains — do **not** claim `DONE`. Carries the v0.1.0 rule: no item flips
to `DONE` until browser-verified on the live deploy; unshipped sub-parts are logged,
never silently dropped.

## Execution model (when GO lands)
Per-item: branch off `release/v0.1.1` → implement (TDD where logic exists; pure
restyle is snapshot-gated) → controller live-verify on a deploy → per-PR artifacts
→ squash-merge → ledger. Same pipeline as v0.1.0. `release/v0.1.1` is the
integration branch; at release it ff-merges to `main` and tags `v0.1.1`.
