# Parchment v0.1.3 — coverage matrix

The deploy-state reconciliation, the honesty reckoning, the PARTIAL audit, and the
cross-refs. Grounded by a 6-cluster code investigation vs the v0.1.2 code
(`release/v0.1.3` = `main` @ `v0.1.2`). Companion to [scope.md](scope.md) +
[README](README.md).

## A. The honesty reckoning (why v0.1.2's "0 PARTIAL" was wrong)
v0.1.2 verified every item on the **local prod-standalone build** (`localhost:3210`) and
claimed 0 PARTIAL. The live deploy contradicts it. Three distinct failure classes:

| Class | Example | Why local verify missed it |
|---|---|---|
| Reverse-proxy / env-config | **CF4** `shareUrl` = `req.nextUrl.origin` → `0.0.0.0:3000` | localhost origin looked correct; only a proxy shows the bind |
| Closed on a code-read, not a screenshot | **C2/CF3** files rail "stale-deploy" | the code said `opacity:1`; the deploy was never screenshotted |
| Genuine bug outside the verified path | **CF6** account name/email empty | F1 verified only the theme select, not these inputs |

**The corrective (the user's, adopted):** redeploy first; reproduce-first WITH EVIDENCE on
every item; live-verify after deploy (light+dark screenshot; CF1 a GIF); name every
PARTIAL. No `0 PARTIAL` claim without a deploy screenshot per item.

## B. The deploy-state question (unresolved — only the redeploy resolves it)
**Both the v0.1.1 and v0.1.2 homelab redeploys were blocked on the 1Password SSH agent.**
So the deploy version is **unconfirmed.** Grounding found a strong **stale-deploy signal** —
many reported items are ALREADY correct in the v0.1.2 code:

| Reported "broken" | v0.1.2-code reality (file:line) | ⇒ |
|---|---|---|
| CF3 rail 30% opacity | `opacity:1`, only Import dims while importing (`FileManager.tsx:2326`) | stale? |
| CF5 double avatar | `TopbarUserCluster` returns null on `/d/` (`:32`) | stale? (or locale prefix) |
| CF7 mode dropdown missing | shipped, right-aligned (`Toolbar.tsx:1303`) | stale? |
| LT1-4 separators | exist, 21 sites (`.parchment-toolbar-sep`) | stale? |
| LT3-3 doc icon | already 32px (`:444`) | stale? |
| LT4-1 active pill | already `--primary-surface` (`NavRow.tsx:38`) | stale? |
| LT5-1 status bar | already 24px (`:987`) | stale? |
| LT6-4 segmented | already `--primary-surface` (`:656`) | stale? |

**Contradiction:** CF1 reports the v0.1.2-only F1 error toast → the deploy has *some*
v0.1.2 code. So the deploy is stale, mixed, or partially-updated — **unknowable from code.**
**Resolution = the redeploy + per-item reproduce-first.** Expect several items to close as
"verified, no code change" WITH a live screenshot; CF4/CF6 to need real fixes; CF1/CF2/CF5
decided by the probe.

> **⛔ Redeploy is prerequisite #1.** Until the homelab runs the v0.1.3 build (needs the
> 1Password unlock), NOTHING is live-verifiable and v0.1.3 would repeat v0.1.2's failure.

## C. Item classification (grounded)
| Type | Items | Note |
|---|---|---|
| Confirmed real code bug | CF4 (proxy origin), CF6 (no defaultValue) | fix regardless of deploy state |
| Deploy-surfaced, probe-then-fix | CF1, CF2, CF3, CF5, LT1-1, LT7-3 | local verify can't catch |
| Already-correct-in-code (confirm) | CF3*, CF5*, CF7, LT1-4, LT1-5, LT3-3, LT4-1, LT5-1, LT6-4 | reproduce-first; live screenshot; never close on code-read |
| Pure CSS value change | LT1-2, LT2-1/2/3, LT3-2/4/5, LT4-4, LT5-4, LT6-2/5 | file:line + value grounded |
| New backend/UI/logic (PARTIAL-risk) | CF2 (2 routes+PATManager+SHA), CF5 (locale guard), LT1-3, LT2-4, LT3-1/6, LT4-2/3/5, LT5-2/3, LT6-1/3, LT7-1/2 | ship or name the gap |

\* CF3/CF5 are both deploy-surfaced AND already-correct-in-code → the probe is the only
arbiter.

## D. PARTIAL-risk audit (named gaps up front)
| Item | Named gap | Ship path | If it can't land |
|---|---|---|---|
| CF2 | `/api/auth/password` + `/api/auth/sessions` (NEW), Developer PATManager UI (NEW), About build-SHA (build-arg) | build them; PAT route exists | ship the rest, HIDE unshipped, log `CF2 PARTIAL (n%)` |
| CF5 | locale/proxy pathname prefix breaking the avatar guard | make the guard prefix-tolerant | name the routing root-cause |
| LT1-3 | chip look (pill+border) | CSS-only | name if not fully matchable |
| LT4-3 | bottom-cluster pin restructure | `justify-between` | name if it misaligns the sidebar |
| LT5-2 | mode indicator (thread editor mode → StatusBar) | new prop | name if mode state can't reach it |
| LT5-3 | word-count split (chars → modal) | edit the modal | name if the modal can't take chars |
| LT6-1 | active-pill semantics (selected vs active) | unify to `--primary-surface` | name the semantic decision |
| LT7-1/2 | URL select-all (Selection API) / single Copy | reuse existing copy | name browser caveats |
| (others LT2-4, LT3-1/6, LT4-2/5, LT6-3) | terse/measured values, baseline drift | confirm vs design | name unresolved values |

**Rule:** no item flips to `DONE` while its named gap is unshipped; no `0 PARTIAL` release
claim without a live screenshot per item.

## E. Cross-refs (one owner, count once)
- **CF7 ≡ LT1-5** — mode dropdown. Owner: CF7. (Already shipped; reproduce-first.)
- **CF4 ≡ LT7-3** — share URL. Owner: CF4 (backend PUBLIC_URL); LT7-3 = verify the copied
  link host on the deploy.
- **LT6-1 ≡ LT4-1** — active pill `--primary-surface`. One token decision, two surfaces
  (NavRow sidebar + FileManager rows) — apply to both.

39 line items → **36 unique deliverables.**

## F. Execution order + sequencing notes
1. **Redeploy** the homelab to the v0.1.3 base (1Password). 2. **CF1 + CF6** (theme save +
profile — unblock visual verify; likely shared auth root). 3. **CF2/CF3/CF4/CF5/CF7**.
4. **LT1** (high-impact). 5. **LT2–LT7**. Sequence the editor-mode trio (CF7/LT5-2/LT5-3)
so the mode source-of-truth is threaded once. Do LT4-1/LT6-1 together (one token, two
surfaces). LT1-1 (sliver) before LT2-1 (page top) so the offsets settle.

## G. Verification gate (STRENGTHENED — the release-defining rule)
After the redeploy: navigate to each route on the **live deploy**, screenshot light+dark,
paste the path in the release notes. Routes: `/files` + sub-rail, `/d/[id]` (full chrome),
every Settings sub-page, the Share dialog, the 404. CF1 adds a theme-toggle GIF. Playwright
visual baselines stay controller-local; CI runs axe/chromium. **NO `0 PARTIAL` without a
screenshot backing every item — this is the one rule v0.1.2 broke.**

## H. Out of scope (explicitly not in v0.1.3)
- Per-email share grants (still v0.2.0); SMTP/Notifications (hidden, not built); full PAT
  library (only the mint/list/revoke UI over the existing route); active-session *revoke*
  beyond read-only + sign-out-other; the baked `NEXT_PUBLIC_COLLAB_URL` "Offline" collab
  fix (separate from CF/L — note it's still present on the deploy).
