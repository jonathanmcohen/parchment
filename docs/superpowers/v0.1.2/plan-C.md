# Plan C — chrome consolidation

> ⛔ **HOLD.** No code until GO on F1+F2. Grounded against the v0.1.1 code. Mostly
> wiring + one stale-deploy verify + one small timing change. **No new feature logic
> except C4 star-persistence (named PARTIAL-risk) and C5 min-delay (small new timing).**
> All colors are S1 tokens.

---

### C1 — Top-right floating avatar → into the title bar

**Files:** `src/app/(app)/layout.tsx:115-127` (the `topbarRight` slot rendering
`UserCluster`); `src/components/shell/UserCluster.tsx:22-140` (the account menu,
fully wired: Manage account → `router.push('/settings')` 55-, Sign out → `POST
/api/auth/logout`, Switch-account disabled placeholder); `src/components/editor/
DocTitleBar.tsx:74-175` (renders `{avatar}` pass-through at 172, prop at 82);
`Editor.tsx:1429` (passes `<Avatar name size={32} />`).

**Current → Target:**
- Current: `DocTitleBar` shows a **plain `<Avatar>`** at the end of the title bar (a
  static image, **no menu**). The fully-wired `UserCluster` account menu lives in the
  app-layout `topbarRight` slot — so on the editor route there is a non-interactive
  avatar in the title bar AND/OR the layout's `UserCluster` floating top-right. The
  reported "floating J avatar with no action" is the **plain Avatar** (it has no click).
- Target: the title-bar avatar **is** the account menu — click → Manage account / Sign
  out / Theme submenu; drop any separate floating/absolute avatar.

**Change:** **wiring, no new endpoints.** Pass `UserCluster` (not a bare `Avatar`) into
`DocTitleBar`'s `avatar` slot — or move the `UserCluster` JSX into the title bar — so
the title-bar avatar opens the existing menu. Ensure it isn't ALSO rendered floating in
the layout topbar on the editor route (no double avatar). Add a **Theme submenu** to
`UserCluster` reusing the F1 theme-set path (the account menu's theme submenu and the
Settings→Account control share one save+refresh).

**Accept:** the title-bar avatar opens the account menu (Manage account works → /settings,
Sign out works, Theme submenu re-themes via F1's path); no separate floating avatar
remains. **Proves it:** surface **#1 (editor idle)** baseline shows one title-bar avatar;
a live click opens the menu; each item fires.

**Steps:** 1) RED #1 (plain avatar / floating). 2) Render `UserCluster` in the title-bar
slot; remove the duplicate/floating copy; add the Theme submenu (F1 path). 3) Live-verify
each menu item. 4) Update #1 baseline.

---

### C2 — Files middle column: fix or remove ⚠ reproduce-first

**Files:** `src/components/file-manager/FileManager.tsx:2326-2578` (the left rail:
Import 2332-2353, folder tree 2381-2416, Smart folders 2420-2493, Tags 2497-2577),
`:520-572` (`FolderTreeItem` drag-drop), `:428-476` (drag handlers → `POST
/api/docs/{id}/move`, `PATCH /api/folders/{id}`).

**Current → Target:**
- Current (grounded): the rail renders at **full opacity** — there is **no `opacity-30`/
  `disabled` class** on the `w-56` container or its children, and drag-drop **is wired**
  (`setDrag`/`getDrag`/`handleDrop`). The reported "~30% opacity broken" does **not match
  the v0.1.1 code** → almost certainly a **stale-deploy (v0.1.0) artifact.** (Grounding
  also flags the spec's "middle column" may actually be this **left** rail — there is no
  separate middle column.)
- Target: a full-opacity folder-tree sub-rail with working drag-drop reorganise (which is
  what the code already is) — OR, if a real dim/broken state reproduces, fix it.

**Change:** **reproduce-first.** On a fresh `release/v0.1.2` build, screenshot the Files
page. If the rail is full-opacity + drag-drop works → the item is a **stale-deploy
artifact**; close as "verified correct + redeploy" and capture the baseline. If a real
dim/broken state reproduces, locate the offending opacity/pointer-events rule and fix it
(token-styled). Either way, confirm drag-drop (`/api/docs/{id}/move`, `/api/folders/{id}`)
works live.

**Accept:** the Files sub-rail is full-opacity, interactive, drag-drop reorganises docs/
folders; no dim "broken" look. **Proves it:** surface **#9 (files page)** baseline (light
+ dark); a live drag of a doc into a folder persists (Network shows the move).

**Steps:** 1) **Reproduce-first** on the fresh build; record opacity + drag-drop. 2) If
stale-deploy: verify + ensure redeploy; if real: find+fix the dim rule. 3) Live drag-drop
check. 4) Capture #9 baseline (light + dark).

---

### C3 — Save wording + connection-aware tooltip

**Files:** `src/components/editor/DocTitleBar.tsx:16-26` (`saveStatusLabel`, returns
"All changes saved to disk" at 22) `:135-137` (the `role="status"` span);
`src/components/editor/useConnectionState.ts` (exists, imported `Editor.tsx:45`);
`src/components/editor/useSaveStatus.ts` / `src/lib/docs/save-status.ts` (the state
machine).

**Current → Target:**
- Current: the saved label reads **"All changes saved to disk"**; no hover detail; the
  connection state isn't surfaced in the label.
- Target: **"All changes saved"** with a tooltip — **"Saved to disk and synced to collab
  service"** when collab is healthy / **"Saved to disk · Offline — collab unavailable"**
  when collab is unreachable.

**Change:** **text change + a tooltip prop.** Shorten the `saveStatusLabel` "saved"
string. Pass the `useConnectionState` value into `DocTitleBar` (already computed in
`Editor.tsx`) and set the tooltip text conditionally. Strings go through the i18n keys
(S5-9 owns copy), not hardcoded. No state-machine change.

**Accept:** the saved label reads "All changes saved"; hovering shows the
connection-aware detail (healthy vs offline); copy is i18n-keyed. **Proves it:** surface
**#1 (editor idle)** baseline shows the shorter label; a live hover (collab up vs killed)
shows each tooltip variant.

**Steps:** 1) RED #1 (long label). 2) Shorten the label; thread `connection` → tooltip;
i18n keys. 3) Live-verify hover with collab up + collab killed. 4) Update #1 baseline.

---

### C4 — Title-bar icons: tooltips + working clicks ⚠ PARTIAL-risk (star persist)

**Files:** `src/components/editor/DocTitleBar.tsx:109-163` (Star 109-120, Move 121-132,
Comments 142-152, History 153-163); `Editor.tsx:1426-1427` (passes `onToggleComments`/
`onToggleVersionHistory`); the FileManager star endpoint `POST /api/docs/{id}/star`
(used at `FileManager.tsx:~879`).

**Current → Target (grounded):**
- **Comments** (142-152): `onClick={onToggleComments}` wired; **missing** an explicit
  `title` tooltip.
- **History** (153-163): `onClick={onToggleVersionHistory}` wired; **missing** an
  explicit `title` tooltip.
- **Move** (121-132): `disabled`, `title="Move (coming soon)"` — honest placeholder.
- **Star** (109-120): toggles **local state only** — `title="Star"` but **no persist
  endpoint** from the editor (the v0.1.1 S3-1 note flagged star/move as placeholders).
  Clicking it then reloading loses the star.
- Target: all four have hover tooltips + a working click, or an honest "coming soon"
  tooltip on a clearly-disabled control — **no dead button.**

**Change:** add `title` (or the `Tooltip` component) to Comments + History. For **Star**
(PARTIAL-risk): either **wire it to the existing `POST /api/docs/{id}/star`** (same
endpoint FileManager uses — so it's reuse, not new backend, and the star persists) **or**
keep it disabled with a "coming soon" tooltip and log `C4 PARTIAL` naming star-persist.
Move stays the disabled placeholder.

**Accept:** Comments/History have tooltips + toggle their drawers; Star either persists
(reload-survives) via the existing endpoint or is a clearly-disabled "coming soon";
Move is disabled "coming soon"; no dead control. **Proves it:** surface **#1 (editor
idle)** baseline; live: each icon's tooltip shows, Comments/History open their drawers,
Star (if shipped) survives reload.

**Steps:** 1) Add tooltips to Comments + History. 2) Decide Star: wire `/api/docs/{id}/
star` (persist) OR disable+label (log PARTIAL). 3) Live-verify tooltips + clicks +
star-reload. 4) Update #1 baseline.

---

### C5 — "Saving…" transient visible 200–500ms ⚠ small new timing

**Files:** `src/components/editor/useSaveStatus.ts:24-52` (`markSaving` 35, `markSaved`
40-46); `src/lib/docs/save-status.ts:23-36` (idle→saving→saved); `Editor.tsx:810-824`
(`save()` calls `markSaving()` then `markSaved()` in `.finally()`).

**Current → Target:**
- Current: `save()` flips `markSaving()` immediately and `markSaved()` the instant the
  fetch settles. On a fast network (<200ms) the "Saving…" label **flashes too fast to
  see** — the user perceives no transient.
- Target: "Saving…" is reliably visible **200–500ms** on first edit before settling to
  "All changes saved" (C3 wording).

**Change:** **small new timing logic** in the save state machine — give `markSaved()` a
minimum-visible delay so a sub-200ms save still shows "Saving…" for ~200–500ms before
transitioning. Cleanest: record the `markSaving` timestamp (passed in / via args, since
`Date.now()` is fine in app runtime) and `setTimeout` the `saved` transition for the
remainder of the floor. Do not delay the actual save — only the label transition. The
5-minute idle timeout is unchanged.

**Accept:** a small edit on a fast connection shows "Saving…" for ~200–500ms, then "All
changes saved"; the label stays for 5 min then idles; `role="status"` still announces.
**Proves it:** live — make an edit, observe the transient (record); a unit test on the
state machine asserts the floor.

**Steps:** 1) Confirm the flash-too-fast behavior on the fresh build. 2) Add the
min-visible floor to `markSaved()`; TDD the state machine (saving persists ≥ floor, then
saved, then idle). 3) Live-verify the transient is visible. 4) (no baseline — transient;
capture a short recording.)

---

## Coverage check
- **Mostly wiring + verify:** C1 moves the existing `UserCluster` menu into the existing
  `DocTitleBar` avatar slot (both exist, fully wired); C2 is reproduce-first (the
  reported dim rail isn't in the code); C3 is a string + a tooltip fed by the existing
  `useConnectionState`; C4 adds two tooltips + a star-persist decision (reuse the
  FileManager star endpoint); C5 is the one genuinely-new bit — a min-visible delay.
- **Tokens / i18n:** C3 copy goes through S5-9 i18n keys; tooltips + menu use the v0.1.1
  `.px-menu`/Tooltip primitives; no literals.
- **Cross-item:** C1's Theme submenu shares **F1**'s theme-set + refresh path (one save
  path, two entry points); C3/C5 share the save-status state machine (C3 = wording, C5 =
  timing) — coordinate so they don't conflict; C4's Comments/History reuse the same
  `onToggle*` props the menu bar (F-plan) uses.
- **Out of scope:** any new account-management backend (C1 reuses logout/settings); a
  separate middle column (C2 — doesn't exist; it's the left rail); per-doc star schema
  (C4 reuses the existing star endpoint).

## Newly-discovered gaps / scoping flags
- **C2 dim rail not in code** — likely stale-deploy; reproduce-first, close-or-fix.
- **C4 star has no editor-side persist today** — reuse the FileManager
  `POST /api/docs/{id}/star` (reuse, not new backend) or keep the honest placeholder;
  PARTIAL-risk named.
- **C5 min-delay is new timing logic** — small, scoped, TDD'd; honestly flagged (not
  "pure polish").
- **C1 double-avatar risk** — ensure the avatar isn't rendered both in the title bar and
  the layout topbar on the editor route.

## Failure-modes-verified
- **Avatar opens nothing (C1):** the title-bar avatar opens the wired `UserCluster`
  (Manage account → /settings, Sign out → logout, Theme submenu re-themes via F1); no
  second floating avatar remains (grep the editor route for a duplicate).
- **Stale-deploy false-fix (C2):** reproduce-first — if the dim rail doesn't reproduce on
  the fresh build, it's a v0.1.0 artifact (verify + redeploy, don't invent a fix); if it
  does, find the real opacity/pointer-events rule; either way drag-drop persists live.
- **Tooltip drift on connection (C3):** the tooltip reflects live collab health (test
  with collab up AND killed); the label is "All changes saved" (not "…to disk"); copy is
  i18n-keyed, not hardcoded.
- **Dead title-bar buttons (C4):** every icon has a tooltip; Comments/History open their
  drawers; Star either survives reload (persisted via the existing endpoint) or is a
  clearly-disabled "coming soon" (logged); Move stays disabled "coming soon".
- **Transient never seen / too long (C5):** a sub-200ms save still shows "Saving…" for
  ~200–500ms (DevTools fast network), then "All changes saved"; a slow save isn't
  artificially extended past the floor; `role="status"` announces; unit test asserts the
  floor.
- **Save-machine conflict (C3+C5):** wording and timing changes coexist — the label text
  (C3) and the min-visible floor (C5) are tested together so neither regresses the 5-min
  idle.
- **Light AND dark:** C1–C4 surfaces captured in BOTH schemes; tooltips/menus legible in
  dark.
