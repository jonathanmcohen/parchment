# Plan CF — carry-forward from the v0.1.2 live deploy

> 🟢 **GO — executing.** Plans fine-combed; deploy confirmed v0.1.2 (reports real). Grounded vs the v0.1.2 code. **Every CF item
> is reproduce-first: paste a curl / DOM probe / screenshot SHOWING the bug before writing
> the fix.** Several CF items are already correct in code (CF3/CF5/CF7) — the probe on the
> redeployed build decides confirm-or-fix. No raw hex; S1 tokens.

**Verification surface = the LIVE DEPLOY** (`parchment.local.jonco.dev`), not localhost —
that is the whole point of this release. Redeploy to the v0.1.3 build is prerequisite #1.

---

### CF1 — Theme save fails on the deploy 🌐

**Files:** `src/app/api/settings/theme/route.ts` (PUT handler, auth at ~20-26);
`src/lib/auth/session.ts:37` (`secure: env.nodeEnv === 'production'`);
`src/components/settings/AccountThemeSelect.tsx:60` (the error toast).

**Current (grounded):** Settings → Account → Appearance change returns the toast **"Could
not save appearance. Try again."** — which is the v0.1.2 F1 `AccountThemeSelect` catch
branch surfacing a failed PUT. The frontend is wired (F1); the PUT is failing on the
deploy. **Primary hypothesis:** the session cookie isn't transmitted on the PUT behind
Caddy — `secure` is gated on `env.nodeEnv === 'production'`; if the container's `NODE_ENV`
isn't `production`, the cookie is set non-secure, and depending on the Caddy TLS
termination + SameSite, the authenticated PUT 401s. **But the GET pages load (user is
logged in), so the probe must confirm the ACTUAL failure** (cookie vs body-validation vs
DB write) — do not assume.

**Reproduce-first probe (BLOCKING):**
```bash
# with a real session cookie jar from a browser login (or a minted session):
curl -v -b cookies.txt -X PUT https://parchment.local.jonco.dev/api/settings/theme \
  -H 'Content-Type: application/json' \
  -d '{"accent":"#1a73e8","fontPair":"system","colorScheme":"dark","pageBg":"white","highContrast":false,"dyslexicFont":false}'
# Record: HTTP status + body. 401 → auth/cookie; 400 → body validation; 500 → DB write.
# Also: does the browser even SEND the session cookie on this request (DevTools Network)?
```

**Fix (after the probe pins the cause):**
- If 401/cookie: do **NOT** blindly `secure: true` — that breaks **local http dev**
  (a secure cookie is not sent over `http://localhost`). Use a guarded approach:
  `secure: env.nodeEnv === 'production' || process.env.SECURE_COOKIES === 'true'` (so the
  deploy sets `SECURE_COOKIES=true`, local dev stays http-friendly) AND/OR ensure the
  deploy container actually sets `NODE_ENV=production`. The cookie is `httpOnly; sameSite:
  'lax'` (`session.ts:36-38`) — also confirm via DevTools that the cookie is *transmitted*
  on the PUT (vs regenerated/dropped); SameSite=Lax can interact with the proxy. Document
  `SECURE_COOKIES` (or the NODE_ENV requirement) in the docker-compose `.env` for the
  redeploy.
- If 400/500: fix the body parse / `setWorkspaceTheme` write per the actual error.
- Remove the error toast path only once save succeeds (keep it for genuine failures).
- **Add an e2e test:** toggle light→dark→system, assert each persists across reload.

**Accept (LV, light AND dark + GIF):** from the deploy, change Appearance to Light/Dark/
System → the app re-themes, persists across reload, **no error toast**. Attach a GIF of
the toggle. **Proves it:** the curl now returns 200; the e2e test is green.

**Steps:** 1) Probe the deploy, paste status+body. 2) Fix per the pinned cause. 3) e2e
toggle+persist test. 4) Redeploy-verify + GIF.

---

### CF6 — Account name/email render empty (real code bug, repro local)

**Files:** `src/app/(app)/settings/account/page.tsx` (async server component; inputs ~23-29
name, ~35-41 email — **no `defaultValue`, never calls `requireUser()`**).

**Current (grounded):** the page renders the Display-name + Email inputs **empty** even
when logged in — it never reads the session user nor binds `defaultValue`. **This
reproduces LOCALLY** (deploy_surfaced=false) — v0.1.2's F1 verify only checked the theme
select, not these fields. Honest miss, likely the same auth-family neighbor as CF1.

**Reproduce-first probe:** load `/settings/account` (local prod build OR deploy) while
logged in → DOM shows `<input id="account-name" value="">` + `<input id="account-email"
value="">` empty, while the sidebar shows the user's name (proving auth works).

**Fix:** `const user = await requireUser()` at the top of the page; `defaultValue={user.name}`
on the name input, `defaultValue={user.email}` on the email input. (If the name/email are
meant to be editable + saved, that's a separate save path — for v0.1.3 just POPULATE them
correctly; a save endpoint, if not present, is a named follow-up, not silent.)

**Accept (LV):** `/settings/account` shows the real name + email populated; **add an e2e
test** that loads the page and asserts the fields are non-empty. **Proves it:** DOM probe
shows the populated values on the deploy (light + dark screenshot).

**Steps:** 1) DOM probe empty. 2) `requireUser()` + defaultValues. 3) e2e populate test.
4) Redeploy-verify.

---

### CF2 — Settings ghosted sub-pages: ship-or-hide per page 🌐 ⚠ PARTIAL-risk

**Files:** `src/app/(app)/settings/_nav.tsx`; each sub-page under `settings/*`;
`/api/auth/pat/route.ts` (exists), `src/lib/health/probes.ts`, the `auditLog` table;
**NEW** `/api/auth/password/route.ts` + `/api/auth/sessions/route.ts`; **NEW**
`PATManager` client component; `src/lib/version.ts` (build-SHA).

**Current (grounded):** the sub-pages **render functional content in code** (Workspace =
WorkspaceNameSetting + autosave + locale + appearance; Admin = Audit reads `auditLog`,
Health = `probeAll()`; Developer = stub text + working WebhooksManager; Security = password
*form* unsubmitted + MfaSection + empty Sessions; About = `/whats-new` version+repo+license).
So the "ghosted/dim on deploy" is **NOT a code stub for most** — it must be reproduced
(CSS dim vs auth-failed-empty, likely tied to CF1).

**Reproduce-first probe:** on the deploy, visit `/settings` + each sub-page; for each
record (a) is the nav link/content dim (computed `opacity`/`color:--muted`)? (b) does the
data load (Health pills, Audit rows, Webhooks)? Screenshot each light + dark. Determine:
CSS-dim vs auth-empty (CF1 root) vs genuine stub.

**Decision per page (ship = functional, hide = removed from nav):**
- **Workspace → SHIP** (name field already wired to `/api/settings/workspace`). Verify live.
- **Admin → SHIP** Audit (reads `auditLog`) + Health (`probeAll()` pills) — both wired,
  verify live; no new API.
- **Developer → SHIP** a **PATManager** client component (NEW UI; `/api/auth/pat` GET/POST/
  DELETE exists) replacing the stub text — list + mint + revoke PATs.
- **Notifications → HIDE** — remove the entry from `_nav.tsx` (no SMTP shipped).
- **Security → SHIP** change-password + Active-sessions read-only: **NEW**
  `POST /api/auth/password` (verify old + hash new + update) and **NEW** `GET
  /api/auth/sessions` (list the user's sessions); wire the password form + render the
  sessions list (read-only; sign-out of OTHER sessions optional).
- **About → SHIP** version + **build-SHA** + GitHub: add a `GIT_SHA` (build-arg/env) to
  `version.ts` + display it; version+repo already render.

**PARTIAL gap (named):** the **2 new auth routes**, the **PATManager UI**, and the
**build-SHA** are new logic — if any can't land in-window, ship the rest + log
**CF2 PARTIAL (n%)** naming exactly what's deferred (and HIDE, don't dim, anything unshipped).

**Accept (LV):** every visible Settings sub-page is functional or removed from the nav; no
dim/ghosted page; Audit rows + Health pills + Webhooks + PAT mint + change-password +
sessions list all work live; About shows version+SHA+GitHub. Screenshot each (light+dark).

**Steps:** 1) Probe each sub-page on the deploy (dim? data loads?). 2) Build PATManager +
the 2 auth routes + build-SHA; wire Security; HIDE Notifications. 3) Redeploy-verify each;
screenshot. 4) Log any PARTIAL with the named gap.

---

### CF3 — Files left rail ~30% opacity on the deploy 🌐

**Files:** `src/components/file-manager/FileManager.tsx:2326` (the `w-56` left-rail
wrapper); `src/app/globals.css` (any cascade).

**Current (grounded):** the rail wrapper has **no opacity class** — only the Import button
has `opacity-50` *while importing*. **Code is clean (opacity:1)** — v0.1.2's C2 read was
correct. So the deploy "30% opacity" is **either** a CSS cascade/proxy artifact **or** a
stale deploy. **Unresolved from code — the deploy probe is BLOCKING.**

**Reproduce-first probe (BLOCKING):** on the **redeployed** build, open `/files`, DevTools
→ compute `opacity` on the left-rail wrapper AND every ancestor. Screenshot. Record the
actual computed opacity + which element (if any) is <1.

**Fix (decided by the probe):**
- If the rail is full-opacity post-redeploy → **stale-deploy artifact**; close
  **verified-with-screenshot** (NOT a code-read — the C2 lesson).
- If genuinely dim → find the offending rule. Per the user, the **decision is REMOVE the
  sub-rail** (cite the exact JSX lines to delete from `FileManager.tsx`) unless the fix is
  a single-file change.

**Accept (LV):** `/files` left rail is full-opacity + interactive (drag-drop works) on the
deploy, OR the rail is removed — screenshot proving it (light+dark). **No close on a
code-read.**

**Steps:** 1) Redeploy. 2) DevTools opacity probe + screenshot. 3) Confirm-or-remove. 4) LV.

---

### CF4 — Share URL uses the internal bind, not the public host 🌐 (= LT7-3)

**Files:** `src/app/api/docs/[id]/shares/route.ts:10-11` (`shareUrl` → `req.nextUrl.origin`);
`src/lib/env.ts` (add `publicUrl`); a sweep of all req-origin URL builders; README +
docker-compose (document `PUBLIC_URL`).

**Current (grounded — CONFIRMED bug):** `shareUrl(req, token)` = `new URL('/share/${token}',
req.nextUrl.origin)`. Behind Caddy, `req.nextUrl.origin` is the **internal `0.0.0.0:3000`
bind** → the share link reads `https://0.0.0.0:3000/share/<token>`. Local verify used the
localhost origin so it looked correct — **the canonical local-verify blind spot.**

**Reproduce-first probe:** on the deploy, create a share (UI or `curl -X POST
/api/docs/:id/shares`) → the returned `url` host is `0.0.0.0:3000` (or the bind), not
`parchment.local.jonco.dev`.

**Fix:** add a server-only `PUBLIC_URL` to `env.ts` (`process.env.PUBLIC_URL ||
process.env.PARCHMENT_RP_ORIGIN || 'http://localhost:3000'`); `shareUrl` uses `env.publicUrl`
instead of `req.nextUrl.origin`. **Sweep** every other user-facing absolute-URL builder
(grep `req.nextUrl.origin` / `req.url` / `headers.get('host')` across `src/app/api` — email-in
addresses, webhook callback URLs, OG meta, any reset/share link) and route them through
`env.publicUrl` too. **Document `PUBLIC_URL`** in README + the homelab docker-compose `.env`
(default `http://localhost:3000`; require redeploy when changed).

**Accept (LV):** a share created on the deploy returns/copies
`https://parchment.local.jonco.dev/share/<token>` (the configured PUBLIC_URL); no
`0.0.0.0`. **Proves it:** the curl `.url` shows the public host; the copied link opens.

**Steps:** 1) Probe the bad URL. 2) `env.publicUrl` + shareUrl + sweep. 3) Document
PUBLIC_URL. 4) Set it on the homelab `.env`; redeploy-verify the copied link.

---

### CF5 — Double avatar (topbar + title-bar) 🌐 ⚠ PARTIAL-risk

**Files:** `src/app/(app)/layout.tsx:118` (`TopbarUserCluster`);
`src/components/shell/TopbarUserCluster.tsx:32` (pathname guard);
`src/components/editor/Editor.tsx:1465` + `DocTitleBar.tsx:243` (title-bar `UserCluster`).

**Current (grounded):** the code **gates correctly** — `TopbarUserCluster` returns `null`
when `pathname === '/d' || pathname.startsWith('/d/')`. **The locale hypothesis is RULED
OUT** — the review confirmed there is **no URL locale prefix** (no `[locale]` group, no
`middleware.ts`, i18n is **cookie-based** `NEXT_LOCALE` per `src/i18n/config.ts`), so the
pathname is never `/en/d/…`. The guard is correct as written. **So if the user sees a
double avatar on the v0.1.2 deploy, the cause is something ELSE the code-read missed** — do
not invent the locale fix.

**Reproduce-first probe (find the REAL cause):** on the deploy, open `/files` (expect 1
avatar in the topbar) and a doc `/d/<id>` (expect 1 in the title bar, 0 in the topbar).
DOM-count `[aria-haspopup="menu"]`/avatar elements per route + log `window.location.pathname`
(confirm it's NOT prefixed). If 2 on `/d/`: trace WHICH two components render — is the
topbar `TopbarUserCluster` actually returning null? is `DocTitleBar` rendering its avatar
twice? is there a third avatar source? Find the actual second render path.

**Fix (decided by the probe):** fix the real second render path the probe finds. If the
probe shows a SINGLE avatar on the redeployed (full v0.1.2) build → the user's report was
against an older build → close **DONE / verified-no-change WITH the screenshot** (NOT on
the code-read). **PARTIAL gap (named):** only if a genuine second source is found that
can't be cleanly removed in-window.

**Accept (LV):** exactly ONE avatar on every route (topbar on non-editor, title-bar on
`/d/`) on the deploy — DOM count + screenshot.

**Steps:** 1) Probe avatar count + pathname per route. 2) Fix the guard if needed. 3) LV
count=1.

---

### CF7 — Editing/Suggesting/Viewing mode dropdown (= LT1-5)

**Files:** `src/components/editor/Toolbar.tsx:1303-1333` (the mode `<Menu>`);
`globals.css:1187` (`.parchment-toolbar-mode { margin-inline-start:auto }`).

**Current (grounded):** the mode dropdown is **SHIPPED** — a right-aligned `<Menu>` with
Editing/Suggesting/Viewing, always rendered, state wired (Toolbar.tsx:244-276). v0.1.2 F3
"it exists" is confirmed. The user's "not shipped" conflicts with the code.

**Reproduce-first probe:** on the deploy, open `/d/<id>`, DOM-find
`.parchment-toolbar-mode` (or aria-label "Editing mode") at the toolbar right; click → the
3-option menu; verify keyboard-operable. Screenshot.

**Fix (decided by the probe):** if present on the deploy → close **verified-with-screenshot**
(this was stale-deploy). If genuinely missing → runtime issue (a conditional false / Menu
broken) — diagnose + fix. Three modes; default Editing; Suggesting → D2 track-changes;
Viewing → read-only.

**Accept (LV):** the mode dropdown is at the toolbar right end on the deploy, opens, and
each mode takes effect (Suggesting=track-changes, Viewing=read-only). Screenshot.

**Steps:** 1) DOM probe on the deploy. 2) Confirm-or-fix. 3) LV each mode.

---

## Coverage check
- **Real code bugs (fix regardless of deploy state):** CF4 (`req.nextUrl.origin` →
  PUBLIC_URL — confirmed); CF6 (account page no `requireUser()`/`defaultValue` — repro
  local). These are honest misses from v0.1.2's local-only verify.
- **Deploy-surfaced, probe-then-fix:** CF1 (cookie/auth behind Caddy — probe pins the
  cause), CF2 (dim vs auth-empty — likely CF1 family), CF3 (rail opacity), CF5 (avatar).
- **Already-correct-in-code (reproduce-first to confirm stale-deploy):** CF3, CF5, CF7 —
  **never close on the code-read; require a live screenshot** (the C2 lesson).
- **New backend/UI (CF2 PARTIAL-risk):** `/api/auth/password`, `/api/auth/sessions`,
  PATManager UI, build-SHA — ship or name the gap.
- **Cross-refs:** CF4 = LT7-3; CF7 = LT1-5.
- **CF1+CF6 likely share an auth/session root** — investigate together; a fix to the
  session/cookie may resolve both the theme-save and (if auth-related) the profile-empty.

## Newly-discovered gaps / scoping flags
- **The deploy version is unconfirmed.** Many CF items are already correct in code →
  stale-deploy strongly indicated, but CF1's error-toast is v0.1.2-only → mixed/unknown.
  **The redeploy + per-item probe is the only resolution.**
- **CF2 build-SHA** needs a build-time `GIT_SHA` injected into the image (docker build-arg)
  — if the pipeline can't guarantee it, that sub-part is PARTIAL.
- **CF4 sweep** must be exhaustive (not just the share route) or other absolute URLs stay
  broken on the deploy.

## Failure-modes-verified
- **Closing on a code-read (the C2 mistake):** FORBIDDEN. CF3/CF5/CF7 each require a
  live-deploy screenshot/DOM-probe before any close — even to close as "stale-deploy
  verified."
- **Theme-save false-fix (CF1):** the probe must pin the ACTUAL cause (401 vs 400 vs 500)
  before changing `secure`/NODE_ENV — don't assume cookie; the e2e toggle+persist test
  guards the regression.
- **Profile populate (CF6):** assert the fields are NON-empty in an e2e test (not just that
  the page renders) — a vacuous test passes on the bug.
- **Share URL incompleteness (CF4):** sweep ALL req-origin builders; a probe of the share
  route alone leaves email-in/webhook URLs broken; verify the copied link actually opens on
  the public host.
- **Avatar guard breaks on locale (CF5):** test the guard against a prefixed pathname
  (`/en/d/…`); count avatars = 1 on every route on the deploy.
- **CF2 half-built:** anything not shipped functional is HIDDEN (removed from nav), never
  left dim; PARTIAL names the exact deferred route/UI/SHA.
- **Local-green ≠ deploy-correct (the release-defining lesson):** EVERY CF item's `DONE`
  requires a live-deploy verification (light+dark screenshot; CF1 a GIF) AFTER the redeploy
  — unit-green is necessary, not sufficient.
