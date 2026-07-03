# Offline editing (PWA) — v0.2.10 design

## Context

A partial PWA scaffold already landed in PR #55 (`feat(G11)`), refined by the S3-6
status-bar work. What EXISTS on `release/v0.2.10`:

- `src/app/manifest.ts` → served at `/manifest.webmanifest`, linked from `src/app/layout.tsx`.
- `public/sw.js` — hand-rolled SW: install (precache `/` + best-effort `/offline`),
  activate (delete stale caches, `clients.claim`), fetch (classifier-driven).
- `src/lib/sw-strategy.ts` — pure `swStrategyFor()` classifier (source of truth) +
  `tests/unit/sw-cache-rules.test.ts`. `public/sw.js` keeps a hand-synced JS copy.
- `src/components/ServiceWorkerRegister.tsx` — prod-only registration; currently
  **force-reloads** the page on `updatefound`.
- Connectivity UX **already built**: `src/components/editor/useConnectionState.ts`
  (navigator.onLine trap handled: server-safe `true` default, real value adopted in a
  post-mount effect — the V5/#418 fix) → `StatusBar.tsx` connection dot
  (online/syncing/offline) + `DocTitleBar` tooltip.
- Per-doc Yjs persistence in `Editor.tsx` via `IndexeddbPersistence('parchment-doc-<id>')`
  with a careful offline-seed race guard. Offline EDIT of an opened doc already works at
  the CRDT layer; edits sync via the collab WebSocket on reconnect (NOT queued API POSTs).
- PWA icons in `public/icons/`; self-hosted fonts in `public/fonts/`.

## Gaps to close (this change)

1. **No `/offline` route** — SW precaches/falls back to `/offline` but the page does not
   exist, so a never-visited doc offline degrades to a bare inline 503 string (flow 4c).
2. **Cache version hardcoded `parchment-v1`** — not keyed to `APP_VERSION`; a release can
   leave a stale shell pinned. This is the exact multi-release stale-cache trap the spec
   warns against.
3. **No logout cache-clear** — a shared machine leaks the previous user's cached shell +
   per-doc Yjs content.
4. **Fonts served via `swr`, not precached** — shell boot offline may miss fonts on first
   offline load.
5. **`start_url: '/'`** — spec wants `/files`.
6. **Dead code**: `OfflineIndicator.tsx` (unused; contains the unsafe
   navigator.onLine-in-initializer pattern that `useConnectionState` replaced) + its
   orphaned CSS.
7. **SW auto-reload** on update can reload mid-session (lost focus/scroll).

## Decisions

### D1 — Version-scoped caches with zero workflow/Dockerfile changes

`public/sw.js` is a static asset (Next does not template it), and the spec forbids
touching workflows/Dockerfile. So inject the app version through the **registration URL**:

- `ServiceWorkerRegister` imports `APP_VERSION` (client-safe; no `server-only` guard) and
  registers `/sw.js?v=${APP_VERSION}`.
- Inside `sw.js`, derive `CACHE_VERSION = 'parchment-shell-' + (new URL(self.location.href)
  .searchParams.get('v') || 'dev')`. `self.location.href` carries the `?v=` query for the
  SW script, so the cache name is version-scoped with no build step.
- A version bump changes the SW script URL → browser installs a new SW → `install` opens a
  fresh versioned cache; `activate` deletes every `parchment-shell-*` cache that is not the
  current one. No stale shell survives an upgrade.
- Cache-name logic is factored into a pure `shellCacheName(version)` in `sw-strategy.ts`
  and unit-tested; `sw.js` inlines the same one-liner.

### D2 — SW update UX: opt-in refresh, no mid-session reload

Content-hashed `/_next/static/**` is immutable and cache-first, so a partially-updated
session is not a correctness risk for assets, but an unsolicited reload is disruptive.

- `install` no longer calls `skipWaiting()` unconditionally; the new SW waits.
- `activate` still cleans stale caches + `clients.claim()`.
- `ServiceWorkerRegister` **stops auto-reloading**. When a new worker reaches `installed`
  while a controller exists, it surfaces a small themed **"Update ready — refresh"** toast
  (clone of the `WhatsNewToast` pattern / `.parchment-whatsnew-toast*` CSS). Clicking it
  `postMessage({type:'SKIP_WAITING'})` to the waiting SW; the SW calls `skipWaiting()`; a
  single `controllerchange` listener then reloads once. The user chooses when.
- First install (no existing controller) needs no prompt — nothing to refresh from.

### D3 — `/offline` route

Add `src/app/offline/page.tsx` at the app root (sibling to `not-found.tsx`) so it renders
through the ROOT layout, NOT the auth-gated `(app)` shell (offline navigations can't reach
`requireUser()`). Model on `not-found.tsx`: opt into `data-color-scheme="system"` so tokens
resolve to the OS scheme without any DB/auth read; zero hardcoded hex. Copy: explains the
page isn't cached yet, offers a "Try again" reload and a link to `/files` (which is cached
after first visit). This is the graceful page for flow 4c.

### D4 — Precache fonts + shell routes

Extend `install` precache (best-effort, non-atomic so one 404 can't roll back `/`): add the
core self-hosted fonts (`roboto-400/500/700`, `roboto-mono-400`) and the app icons. Reclassify
`/fonts/` and `/icons/` as `cache-first` in the classifier (they are effectively immutable;
the big `material-symbols-rounded.woff2` stays lazy/`swr`-then-cache-first to avoid a 5 MB
precache). Keep `/api/**` `network-only` (Google-font proxy stays online-only — documented
limit).

### D5 — Logout cache-clear (security)

Add `src/lib/offline/clear-caches.ts` exporting `clearOfflineCaches()`:
- delete every `caches` key matching `parchment-*`;
- enumerate `indexedDB.databases()` and delete each `parchment-doc-*` (the per-doc Yjs stores).
Browser-only guards throughout (`typeof window`, feature-detect `indexedDB.databases`). Call
it (awaited, best-effort try/catch) before the redirect in BOTH sign-out triggers
(`sign-out-button.tsx`, `UserCluster.tsx`). Chosen over content-only scoping because per-doc
IndexedDB Yjs content is genuinely user data that must not persist across logout on a shared
machine. The name-matching predicate is pure + unit-tested.

### D6 — Manifest polish

`start_url: '/files'`; keep `theme_color`/`background_color` matching the fixed chrome tokens
(`#1a73e8` / `#ffffff`, verified against `tokens.css`). Icons unchanged.

### D7 — Remove dead code

Delete `src/components/editor/OfflineIndicator.tsx` and its orphaned
`.parchment-offline-indicator` / `.parchment-offline-pill` CSS. `useConnectionState` +
`StatusBar` are the live path.

## Out of scope (documented limits)

- Offline CREATE of new docs (needs an offline id/queue).
- `/files` listing freshness offline (shows last-cached shell; the FileManager refetch-on-mount
  needs the network).
- Cross-device conflict UI (the Yjs CRDT already merges edit conflicts).
- Picked Google fonts offline (served under `/api/**` = network-only).

## Testing

- Unit (TDD): `shellCacheName()` versioning + stale-cache predicate; `clearOfflineCaches`
  name-matching predicate; extend `sw-cache-rules.test.ts` for the new `/fonts/`, `/icons/`
  cache-first rules and `/offline` navigate handling.
- e2e-a11y chromium: `/offline` page passes a11y (added to `a11y.public.spec.ts`).
- Live (prod serve on ports 3108/1248, db 5508): flows 4a/4b/4c, install criteria, logout
  clears caches, share-link works with SW active.

## Fixes surfaced during live verification (added to the above)

These closed real gaps that only appeared under a real SW + real offline:

### D8 — reconnect on `online` so offline edits sync (fixes flow 4b)
The existing `goOffline()` calls `provider.disconnect()` (permanent — a guard against a
never-collab-doc force-seed merging with server state on reconnect). But that meant an
offline edit, durably in the ydoc + IndexedDB, never reached the server after the network
returned. Added an `online`-event listener in `Editor.tsx` that calls `provider.connect()`
(guarded to only fire when the socket is down). By then the doc is long past its one-shot
seed (`seededRef` set), so the reconnect is just the normal Yjs sync, which CRDT-merges
local + server idempotently. Verified: an edit typed offline is seen by a FRESH online
browser session (content that can only come from the server).

### D9 — `updateViaCache: 'all'` on registration (fixes flow 4c reliability)
Registering `/sw.js?v=<APP_VERSION>` with default `updateViaCache: 'none'` makes the browser
revalidate the SW script over the network on navigations; offline, that revalidation fails
and races the first navigation into Chromium's own error page instead of the SW's `/offline`
fallback. We already bust the SW via the `?v=` URL, so per-navigation revalidation is pure
overhead — `updateViaCache: 'all'` removes it and the race.

### D10 — logout: hard navigation + SW-side purge (fixes the cache-clear leak)
A client `router.replace('/login')` keeps the authed page (and its Next.js link-prefetch)
mounted, re-populating the cache with authed shell HTML (username leak) the instant after
`clearOfflineCaches()` deletes it. Fix: (1) both sign-out triggers now `window.location.assign`
(hard nav) so the authed page is torn down; (2) `clearOfflineCaches()` also posts
`{type:'CLEAR_CACHES'}` to the SW, which deletes every `parchment-*` cache from its own
context — running after the page has navigated away, mopping up any last-moment prefetch.
Verified: no authed page HTML remains cached after logout; per-doc Yjs IndexedDB cleared.

### D11 — controllerchange reload only on genuine updates
The activate `clients.claim()` fires `controllerchange` on the first-ever page load as the
SW claims the already-open page. Reloading there is jarring (and raced the a11y scan on the
editor). `ServiceWorkerRegister` now records whether a controller existed at registration and
only reloads on `controllerchange` for an actual update (SKIP_WAITING), never the first claim.
