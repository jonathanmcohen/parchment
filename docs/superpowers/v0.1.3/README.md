# Parchment v0.1.3 — carry-forward fixes + layout-drift sweep

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ⛔  HOLD — SCOPE LOCKED, EXECUTION GATED.                                 ║
║                                                                            ║
║  Do NOT branch a feature, write code, or open a PR until the user replies  ║
║  "GO" on Plan CF1+CF6. On GO, this banner flips to "🟢 GO — CF1+CF6".      ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## Goal
Fix what the **live deploy** of v0.1.2 surfaced (Plan **CF**, carry-forward) and close
the **layout drift** caught in the same sweep (Plan **L**, 7 tiers). Pulled from
`parchment.local.jonco.dev`. **No deferrals** — every item lands under the single
**`v0.1.3`** tag.

## ⚠️ THE honesty reckoning (read this first — it governs the whole release)
v0.1.2 release notes claimed **"0 PARTIAL."** That claim was made on **local
prod-standalone verification** — and the live deploy contradicts it. The root failure:

1. **Local verify ≠ deployed-behind-Caddy verify.** The v0.1.2 items were each verified
   on `node .next/standalone/server.js` at `localhost:3210`. That surface **structurally
   cannot catch** reverse-proxy / env-config bugs. Confirmed example: **CF4** — `shareUrl`
   uses `req.nextUrl.origin` (`shares/route.ts:11`), which behind Caddy resolves to the
   internal `0.0.0.0:3000` bind, not the public host. Local origin *looked* right, so it
   passed. This is a real bug local verify could never have caught.
2. **A code-read is not a deploy screenshot.** v0.1.2 closed **C2** (files rail) as a
   "stale-deploy artifact" on a code-read (`opacity:1`). The user rejects that. The error
   was *closing on the code, not on a live screenshot*. v0.1.3 forbids it.
3. **A genuine code bug slipped local verify (CF6).** The Settings → Account name/email
   inputs never get a `defaultValue` and the page never calls `requireUser()` — they
   render empty. This **reproduces locally**; v0.1.2's F1 verify only checked the theme
   select, not these fields. Honest miss.

### The deploy-state caveat (unresolved, and it matters)
The homelab redeploy was **blocked on the 1Password SSH agent for BOTH v0.1.1 and
v0.1.2** — so the deploy version is **unconfirmed and likely stale/mixed.** Grounding
found **many reported items are ALREADY correct in the v0.1.2 code** — CF3 (rail
`opacity:1`), CF5 (avatar already pathname-gated off `/d/`), CF7 / LT1-5 (mode dropdown
shipped, `Toolbar.tsx:1303`), LT1-4 (separators exist), LT3-3 (doc icon already 32px),
LT4-1 (active pill already `--primary-surface`), LT5-1 (status bar already 24px), LT6-4
(segmented already `--primary-surface`). That pattern says **stale deploy.** Yet CF1
reports v0.1.2-only code (the F1 error toast), so the deploy has *some* v0.1.2 code — a
contradiction only the deploy can resolve.

**Therefore the corrective discipline (the user's, adopted verbatim):**
- **Redeploy is the #1 prerequisite.** Nothing is verifiable until the homelab actually
  runs the v0.1.3 build (needs the 1Password unlock). Without it, v0.1.3 repeats the v0.1.2
  "green locally, broken live" failure.
- **Reproduce-first WITH EVIDENCE on every item.** The implementer pastes a curl / DOM
  probe / screenshot **showing the bug before writing the fix.** An item that does NOT
  reproduce on the redeployed build was stale-deploy → close it **verified-with-screenshot**
  (never silently, never on a code-read).
- **Live-verify AFTER deploy, both light AND dark.** Not unit-test-green. Screenshot every
  restyled surface on the live deploy; the theme-switch fix (CF1) needs a **GIF** of the
  toggle working live.
- **Name every PARTIAL with the specific gap.** No `0 PARTIAL` claim without a deploy
  screenshot backing every item.

## Shape
**39 line items** (36 unique — 3 cross-refs) across **2 plan groups**:

| Order | Plan | Theme | Items |
|---|---|---|---|
| 1 | [CF1, CF6](plan-CF.md) | Theme-save backend + profile load (unblocks visual verify) | 2 |
| 2 | [CF2–CF5, CF7](plan-CF.md) | Settings ship-or-hide · files rail · share URL · double avatar · mode dropdown | 5 |
| 3 | [LT1](plan-L.md) | High-impact layout (sliver, gutter, overflow chip, separators, mode) | 5 |
| 4 | [LT2–LT7](plan-L.md) | Page/outline · title/menu/toolbar microspacing · sidebar · status bar · files · share | 27 |

**Cross-refs (one owner, count once):** CF7 ≡ LT1-5 (mode dropdown) · CF4 ≡ LT7-3 (share
URL) · LT6-1 ≡ LT4-1 (active pill). Tracker: **[scope.md](scope.md)**. Each plan file
carries the per-item current-state, the **reproduce-first probe**, the fix, a **Coverage
check**, and **Failure-modes-verified**. Deploy-state reconciliation + PARTIAL audit:
**[coverage-matrix.md](coverage-matrix.md)**.

## Per-PR artifact requirements
Every item PR MUST attach, in the body:
1. **spec path** — the `plan-*.md` anchor.
2. **RED-on-deploy** — the reproduce-first evidence: a Playwright visual snapshot showing
   the drift, OR a **curl / DOM probe** showing the backend failure (status code + body),
   captured against the **live deploy** (or, pre-redeploy, the v0.1.3-base build with the
   probe that *would* show it on the proxy).
3. **GREEN-on-branch** — the same probe passing.
4. **live-deploy screenshot in BOTH light and dark** of every restyled surface, taken
   **after the redeploy completes**. **CF1 additionally requires a screencast / GIF** of
   the theme toggle working live.

## Verification gate (STRENGTHENED — live-deploy mandatory)
The Cairn task must, AFTER the redeploy completes, **navigate to each route on the live
deploy, screenshot it (light + dark), and paste the screenshot path in the release
notes.** Routes: `/files`, `/files` sub-rail, the editor `/d/[id]` (title/menu/toolbar/
outline/status/page), every Settings sub-page (Account/Workspace/Admin/Admin-Health/
Developer/Security/About), the Share dialog, the 404. Playwright visual-regression
baselines remain controller-local (CI runs axe/chromium only). **No `0 PARTIAL` release
claim without a live-deploy screenshot backing every item.**

## Honesty constraint
Carries v0.1.0–v0.1.2. No item flips to `DONE` until **browser-verified on the live deploy
in light AND dark, with the screenshot attached.** PARTIAL items name the exact gap.
Pre-identified PARTIAL-risk (grounded): **CF2** (Security change-password + sessions
routes, Developer PAT-mint UI, About build-SHA — new backend/UI), **CF5** (locale-prefix
pathname guard), and the LT polish items needing new logic (LT5-2 mode indicator, LT5-3
word-count modal split, LT4-3 bottom-cluster pin, LT6-1 active-pill semantics, LT7-1/LT7-2
share-dialog).

## Execution model (when GO lands)
**Prerequisite #1 — redeploy.** Unblock the 1Password SSH agent; redeploy the homelab to
the v0.1.3 build BEFORE collecting any artifact. Then per item: branch off `release/v0.1.3`
→ **reproduce-first on the deploy (paste evidence)** → implement → controller live-verify
on the deploy (light + dark, screenshot) → per-PR artifacts → squash-merge → ledger. Same
pipeline as v0.1.2; the difference is the verification SURFACE is the live deploy, not
localhost. `release/v0.1.3` ff-merges to `main` + tags `v0.1.3` + multi-arch publish +
homelab redeploy at release.
