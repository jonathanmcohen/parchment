# Parchment v0.1.3 — carry-forward fixes + layout-drift sweep

```
╔══════════════════════════════════════════════════════════════════════════╗
║  🚀  RELEASED — v0.1.3 (2026-06-24).                                       ║
║                                                                            ║
║  39 items: 36 DONE + 3 named PARTIAL (LT2-4/LT3-1/LT6-3). PRs #111–#119.   ║
║  CI green (incl e2e-a11y); tagged v0.1.3. User redeploys manually          ║
║  (set SECURE_COOKIES=true for CF1); deploy self-corrects share URLs (CF4). ║
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

### The deploy-state fact (CONFIRMED v0.1.2, and reachable)
The deploy was probed (2026-06-24): `parchment.local.jonco.dev` is **confirmed running
v0.1.2 code** (its public 404 shows the F6-only "wandered off"; the login shows the
v0.1.1 meta copy) and is **reachable over HTTPS** from this machine for public-route
probes (no SSH needed for those). So **the user's CF/LT reports are REAL observations
against v0.1.2 — NOT stale-deploy artifacts.** That overturns the earlier "probably
stale" hypothesis.

**This raises the bar, not lowers it.** Grounding found several items *appear* correct in
the v0.1.2 code (CF3 rail `opacity:1` in all/smart/tag views, CF5 avatar pathname-gated
off `/d/`, CF7 mode dropdown rendered `Toolbar.tsx:1303`, LT1-4 separators, LT3-3, LT4-1,
LT5-1, LT6-4). **But the user sees them broken on that very code — so a code-read verdict
of "correct" is SUSPECT: there is a real cause the read missed** (a cascade, a conditional,
a prop gate, a view-specific render, a runtime/build difference). The job is to find it,
not to dismiss the report. *(Grounding error already caught: LT6-1 is NOT already-correct —
file rows use `--selection-bg`, not `--primary-surface`; it is a real change.)*

**Corrective discipline (the user's, adopted):**
- **Redeploy is the user's manual step.** The user redeploys the v0.1.3 build when ready
  (the 1Password SSH agent is only needed for that, not for HTTP probes). The deploy is
  reachable now for public-route reproduce-first; authed routes are verified on the local
  prod-standalone build (identical image) + the user confirms on the deploy post-redeploy.
- **Reproduce-first WITH EVIDENCE on every item** — curl / DOM probe / screenshot showing
  the bug (or, for an "appears-correct" item, the probe that finds the missed cause)
  **before** writing the fix. **An "appears-correct" item is NOT closed on the code-read**
  — it is reproduced first; if the probe shows it genuinely correct on the redeployed
  build, close **DONE / verified-no-change WITH the screenshot, no code PR** (that outcome
  is allowed and expected — the C2 lesson is only against closing on a *code-read*).
- **Live-verify after the user redeploys, both light AND dark** — screenshot every restyled
  surface; CF1 adds a **GIF** of the theme toggle.
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
**The deploy is reachable now; the user redeploys the FIXED build manually.** Per item:
branch off `release/v0.1.3` → **reproduce-first** (public route → curl the deploy directly;
authed route → re-read the code for the missed cause + verify on the local prod-standalone
build, which runs the identical image; paste the evidence) → implement → controller verify
on the local prod-standalone build (light + dark) → per-PR artifacts → squash-merge →
ledger. **The CONFIG bugs local verify structurally missed (CF1 cookie, CF4 PUBLIC_URL) are
fixed at the code/env level and the env is documented for the redeploy** — those + every
restyled surface get a **final live-deploy confirmation after the user redeploys** (the
controller curls public routes; the user screenshots authed routes). `release/v0.1.3`
ff-merges to `main` + tags `v0.1.3` + multi-arch publish; the user redeploys; final
live-verify closes the release. **No `0 PARTIAL` claim without that post-redeploy
verification.**
