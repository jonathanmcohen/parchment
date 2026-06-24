# Parchment v0.1.4 — scope

```
╔══════════════════════════════════════════════════════════════════════════╗
║  🛠  IN PROGRESS — v0.1.4. Per-item PRs onto release/v0.1.4.               ║
║  Discipline: reproduce-first WITH EVIDENCE → fix + test → browser-verify   ║
║  (light AND dark) → CI green → user redeploys → final live-confirm.        ║
║  No item flips DONE without a browser/probe artifact. No "0 PARTIAL" claim.║
╚══════════════════════════════════════════════════════════════════════════╝
```

User-reported bugs + the "what else is wrong" audit, all post-v0.1.3. Same honesty
constraint as v0.1.0–v0.1.3: nothing is DONE until browser/live-verified.

## Decisions (locked)
- **V2 email**: Display name + Language editable now; **Email is READ-ONLY** (no
  verification flow exists yet — editing the login identity without one is a
  footgun). Email-edit deferred to a later release.
- **V2 locale**: persist via the EXISTING `setLocale()` server action (NEXT_LOCALE
  cookie) — matches the Workspace LocaleSwitcher. No new settings-table key.
- **V5**: stays in v0.1.4; pin the exact mismatched node via a **dev-build repro**
  BEFORE fixing (root cause is not yet proven — `immediatelyRender:false` is
  already set, so it is NOT the editor content).

## Items
| # | Item | Sev | Effort | Reproduced (evidence) | Fix |
|---|---|---|---|---|---|
| V0 | Account/user-menu theme save — fetch Illegal invocation | high | — | ✅ live error + 200-after | **DONE — PR #120 (bee6bb1), CI green** |
| V1 | Slash menu illegible in dark | high | med | ✅ computed `#fff` bg + `#e8eaed` text; menu portaled outside `[data-color-scheme]` | `container:'[data-color-scheme]'` on suggestion mount |
| V1b | wiki/cite/cairn menus = same bug; cite menu has **no CSS** | high | med | ✅ all 4 use `props.mount` w/ no container; `.parchment-cite-menu` undefined | same container fix (all 4) + author cite-menu CSS |
| V2 | Account name/email/language silently don't save | high | med | ✅ no onChange/submit; no `/api/settings/profile` | new `/api/settings/profile` (name, GET+PUT) + `setLocale()` wire (language) + email read-only |
| V3 | Password change doesn't revoke other sessions | high | small | ✅ `password/route.ts:48` updates hash, returns; no session delete | delete user's sessions except current (`SESSION_COOKIE` sha256) |
| V4 | No rate-limit on password change | high | small | ✅ no `rateLimit()` vs MFA/passkey which have it | reuse `rateLimit()` + `clientIp()` (per-IP, 10/60s, 429+retry-after) |
| V5 | React #418 hydration on editor | high | small | ✅ console #418 `text` mismatch every load (cause UNPINNED) | dev-repro to pin node → defer client-only state |
| V6 | Collab ws URL build-baked (likely broken on deploy) | high | small | ✅ no `NEXT_PUBLIC_COLLAB_URL` build-arg → bakes `ws://localhost:1234` | derive `wss://host/collab` from `window.location` at runtime |
| V7 | Empty 48px top bar above editor chrome | med | small | ✅ `.parchment-topbar h-12` empty on editor; `-32px` hacks | collapse editor topbar via `:has(.parchment-editor-shell)` + drop `-32px` hacks |

## Per-PR artifacts (every item)
1. spec anchor (this file).
2. RED evidence — the reproduce-first probe/screenshot showing the bug.
3. GREEN — the fix verified (unit test + browser/probe).
4. browser-verify light AND dark for visual items (V1/V1b/V7); curl/probe for backend (V2/V3/V4/V6).

## Verification surfaces
- Controller verifies on the **live deploy** (authed via the user's browser session, dark mode active) + local prod-standalone where needed.
- Backend config items (V6) get a **final live-confirm after the user redeploys**.
- CI: lint + typecheck + unit + build + e2e-a11y green per PR.
