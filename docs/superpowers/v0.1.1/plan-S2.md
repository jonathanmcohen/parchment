# Plan S2 — Global chrome (nav rails, top bar, sidebar)

> ⛔ HOLD. Run after S1 (consumes its tokens). No branch / code / PR until the
> user replies "GO" on Plan S1. See [README](README.md).

**Intent:** restyle the global shell to Google Drive shape — white sidebar with a
giant "+ New" mega-menu, Material nav rows, a real wordmark, and a top-right user
cluster. The Files-page client-side view tab strip moves INTO the sidebar.

**No new feature logic.** Every item re-skins or re-surfaces behavior that already
ships in v0.1.0. The ONE exception is flagged explicitly: S2-4's "move views into
the sidebar" crosses from restyle into navigation wiring (the views are React
state, not routes) — it is scoped **PARTIAL** below.

**All colors come from S1 tokens** (`src/styles/tokens.css`), using ONLY the names
in the **"Token vocabulary (canonical)"** table in plan-S1.md. After S1 there is no
hardcoded hex in `src/`. Where this plan writes a literal in a Current→Target line
it is documenting the audit *target* that S1 has already minted as a var; the
actual CSS rule references the canonical var name, never the literal.

### S1 tokens this plan consumes (all canonical — minted by S1-7/S1-8)
| Canonical token (value) | Used by |
|---|---|
| `--primary` `#1A73E8` (FIXED brand) | active nav-row text, mega-menu primary, wordmark glyph |
| `--primary-hover` `#1765CC` | "+ New" hover, mega-menu row hover |
| `--primary-surface` `#E8F0FE` | active nav-row pill background |
| `--surface` (white) | sidebar bg, mega-menu bg, user-menu bg |
| `--surface-muted` `#F8F9FA` | (cards / muted fills) |
| `--surface-hover` `#F1F3F4` | nav-row hover fill, user-cluster menu hover |
| `--border` `#DADCE0` (Google) | sidebar right border, menu dividers |
| `--foreground` `#202124` | wordmark, nav text, menu items |
| `--muted` `#5F6368` | bottom-cluster name, lang, sign-out idle |
| `--error` (red) | sign-out hover |
| `--shadow-dropdown` (S5-3 owns the shared shell class) | "+ New" mega-menu / user-menu elevation — S2 CONSUMES, does not redefine |

**Token discipline (closes findings #4/#12/#15/#22):** every name above is in the
canonical vocabulary — there is **no** "add to S1 if missing / reconcile at
execution time" escape hatch anymore; S1 already mints all of them. The retired
names `--text`/`--text-muted`/`--danger`/`--active-pill`/`--active-pill-text`/
`--hover`/`--accent-pill` do **not** appear in this plan's CSS — they were swept to
`--foreground`/`--muted`/`--error`/`--primary-surface`/`--primary`/`--surface-hover`.

**Shared dropdown (Decision 6):** the "+ New" mega-menu and the `UserCluster`
account menu **consume the shared overlay-elevation CSS owned by S5-3**
(`.px-menu` + `--shadow-dropdown`). S2 does not invent menu elevation — it
references the S5-3 shell. The `--shadow-dropdown` *token* is minted in S1, so the
class can land with the first consumer; S5-3 finalizes/reconciles. S2 menus may
ship flat (token present, shell adopted from S5-3) — never with an inline shadow
literal (closes the dark-shadow minor: S2 emits **no** hardcoded light-only shadow).

---

### S2-1 — Left sidebar → Drive shape

**Files**
- `src/app/(app)/layout.tsx` — `<aside>` at L64; wordmark `<Link>` L65–67; `<nav>` + nav-row `<Link>` map L68–78. (The whole sidebar markup.)
- `src/app/globals.css` — NEW rule block `/* S2: sidebar chrome */` for the `+ New` button, mega-menu, and nav-row pill (Tailwind utilities cover layout; the `+ New` shadow + mega-menu need explicit CSS).
- `src/lib/editor/theme.ts` — no change (consumes `--paper`/`--border` already via wrapper); confirm `--paper` maps to `--surface` white after S1-4.
- NEW component `src/components/shell/NewMenu.tsx` — the "+ New" button + 4-action mega-menu (client component; **surfaces existing actions only**, see Change).

**Current → Target**
| Aspect | Current (map) | Target (audit) |
|---|---|---|
| `<aside>` width | `w-56` = 224px | 256px (`w-64`) |
| `<aside>` bg | `bg-[var(--paper)]` (#ffffff light) | white via `--surface` (S1-4) — keep var |
| `<aside>` border | `border-e border-[var(--border)]` (#e3e1da) | 1px inline-end `--border` = `#DADCE0` (Google) — S1 remints `--border` |
| `<aside>` padding | `p-4` | keep `p-4` but header band 56px tall; "+ New" 56px tall |
| "+ New" control | **does not exist** | NEW 56px-tall white button, 16px radius, elevation via `var(--shadow-dropdown)` on hover (resting uses `var(--shadow-page)` for the subtle 1px lift — both S1 tokens, no inline literal), multicolor plus glyph, label "New" |
| Nav rows | 5 `<Link>` `px-2 py-1.5 text-sm` (~30px), no icon | 7 rows, 36px tall, 12px h-pad, 20px Material icon + 14px text: Files / Templates / Inbox / Shared / Starred / Trash / Settings |
| Active row | none (no active detection) | light-blue pill `--primary-surface` `#E8F0FE` + text `--primary` `#1A73E8` |

**Change**
- Widen aside: `w-56` → `w-64`. Border + bg already var-driven — no literal touched (S1 supplies new `--border`/`--surface` values).
- Add a 56px header band wrapping the wordmark (S2-3 styles the wordmark itself).
- **NewMenu** (NEW, ~120 LOC, client): a button + a popover listing four rows —
  **Blank document**, **From template**, **Folder**, **Upload**. Each row dispatches an action that **already exists**:
  - "Blank document" → the same create-doc call the files page "+ New folder/doc" path uses (reuse, do not author new create logic).
  - "From template" → navigate `/templates`.
  - "Folder" → the existing new-folder action in `FileManager` (lift the handler or route to it; **no new folder logic**).
  - "Upload" → the existing import/upload entry. **Determinate decision (closes the
    Upload-row minor):** the FileManager has an **"↑ Import"** control today
    (`FileManager.tsx:2139`) — the mega-menu "Upload" row routes to that **existing
    import handler** (reuse, do not author an uploader). If at execution time the
    import handler turns out not to accept a file (verify against the code first),
    the row ships as a **visibly-disabled "coming soon" placeholder** (consistent
    with the menu-placeholder rule), NOT silently dropped. Default expectation: it
    wires to Import and ships enabled.
  Copy strings come from S5-8. Mega-menu is a flat surface in S2; its drop-shadow *elevation* is S5-3.
  ```css
  /* globals.css — S2: sidebar "+ New" (all tokens, no inline shadow literal) */
  .parchment-new-btn{
    height:56px; border-radius:16px; background:var(--surface);
    box-shadow:var(--shadow-page);          /* subtle resting 1px lift (S1 token, dark variant included) */
    display:flex; align-items:center; gap:8px; padding:0 16px;
    font:600 14px/1 var(--font-ui); color:var(--foreground);
  }
  .parchment-new-btn:hover{ box-shadow:var(--shadow-dropdown); }   /* deeper hover lift, dark-aware */
  ```
- Nav rows: extend the `nav` array in `layout.tsx` to 7 entries. **Two of the
  seven (Shared, Starred) have no route today** — see S2-4 PARTIAL; ship the
  rows but wire them only as far as routing allows.
  ```tsx
  // layout.tsx — nav rows, 36px, icon + 14px label, active pill
  const active = /* compute from pathname; needs usePathname → see note */ false
  <Link
    href={item.href}
    aria-current={active ? 'page' : undefined}
    className={[
      'flex h-9 items-center gap-3 rounded-full px-3 text-sm', // 36px row, pill radius
      active
        ? 'bg-[var(--primary-surface)] text-[var(--primary)]'   // active pill = brand
        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]', // hover pill #F1F3F4
    ].join(' ')}
  >
    <span className="material-symbols-rounded text-[20px]">{item.icon}</span>
    {t(`nav.${item.key}`)}
  </Link>
  ```
  **Active-row note:** `layout.tsx` is an async **server** component (it `await`s
  `getTranslations`/`requireUser`). `usePathname` is client-only. Active detection
  therefore needs a tiny client wrapper (`NavRow` client component, ~25 LOC) that
  reads `usePathname()` and applies the pill — the server layout passes it
  `href`/`icon`/`label`. This is presentation wiring, not feature logic. The
  **Material Symbols font is loaded by S1-8** (moved out of S4 per finding #17, so
  the nav glyphs render — not tofu — at S2 time); S2 only references the class.

**Accept**
- Sidebar is 256px, white, 1px `#DADCE0` right border; "+ New" is a 56px shadowed
  white button that opens a 4-row mega-menu (or 3 rows if Upload is unwired,
  logged). Exactly one nav row shows the `#E8F0FE`/`#1A73E8` active pill per route.
- **Proves it:** VR surface #2 *files page* (sidebar visible) + a per-route active-pill
  snapshot set (one per nav href). axe: keyboard-operable mega-menu (focus trap/Esc).

**Steps**
1. Write/adjust VR baseline #2 (files page) on `release/v0.1.1` — capture RED (224px purple-tinged sidebar, no + New).
2. Widen aside `w-56`→`w-64`; confirm bg/border still var-only (no literal).
3. Build `NavRow` client wrapper (usePathname → pill); extend nav array to 7 with icons.
4. Add `.parchment-new-btn` CSS + build `NewMenu` reusing existing create/folder/template actions; decide Upload row (wire-or-log).
5. Live-verify on deploy: sidebar shape, mega-menu opens, active pill correct on `/files` and `/settings`.
6. Update VR #2 baseline GREEN in the same PR.

---

### S2-2 — Sidebar bottom cluster

**Files**
- `src/app/(app)/layout.tsx` — footer cluster L79–84 (`<div class="mt-auto …">` with `user.name`, `LocaleSwitcher`, `HelpMenu`, `SignOutButton`).
- `src/components/i18n/LocaleSwitcher.tsx` — muted styling.
- `src/components/help/HelpMenu.tsx` — Help button L~482–500 → icon-only + tooltip.
- `src/lib/auth/sign-out-button.tsx` — sign-out → muted, red on hover.
- `src/app/globals.css` — sign-out hover rule; tooltip (tooltip *system* is S5-2; here a minimal `title`/aria-label so the icon-only Help is not nameless).

**Current → Target**
| Element | Current (map) | Target (audit) |
|---|---|---|
| Cluster | `mt-auto flex-col gap-1 border-t border-[var(--border)] pt-4`; all rows equal-weight gray | reads as **secondary**; avatar + name tight at bottom |
| User name | `px-2 text-[var(--muted)] text-xs` | name row with avatar glyph, `--muted` |
| LocaleSwitcher | nav-item button styling (equal weight) | muted, de-emphasized |
| Help | full text button **"? Help"** (`rounded-md px-2 py-1.5 … text-sm`) | **icon-only** `?` + tooltip |
| Sign-out | `text-[var(--foreground)] … hover:bg-[var(--background)]` | muted idle (`--muted`), **red on hover** (`--error`) |

**Change**
- Footer: keep `mt-auto … border-t pt-4`; tighten name row to `avatar + name` (avatar is the S2-5 initial-glyph component reused at sidebar scale — reuse, do not author a second avatar).
- `LocaleSwitcher`: swap idle text to `text-[var(--muted)]` (token), keep hover.
- HelpMenu button: drop the "Help" label, render `?` glyph only; add `aria-label`/`title="Help"` so it stays accessible (full tooltip styling = S5-2).
- SignOutButton:
  ```tsx
  // sign-out-button.tsx — muted idle, red on hover
  className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--error)]"
  ```

**Accept**
- Bottom cluster reads as secondary (muted), Help is **icon-only with an accessible
  name**, sign-out goes red on hover. No literal hex — all via tokens.
- **Proves it:** VR #2 files page (cluster in frame) + a hover-state snapshot of
  sign-out (red). axe: Help button has a name despite being icon-only (no
  "button has no accessible text" violation).

**Steps**
1. RED snapshot of current cluster (equal-weight gray, "? Help" text label).
2. Tighten name+avatar row; mute Locale + sign-out to `--muted`.
3. Help → icon-only `?` + `aria-label="Help"`.
4. Sign-out red-on-hover rule.
5. Live-verify hover states on deploy; axe the icon-only Help for a name.
6. Update VR #2 baseline.

---

### S2-3 — Parchment wordmark

**Files**
- `src/app/(app)/layout.tsx` — wordmark `<Link href="/">` L65–67.

**Current → Target**
| Aspect | Current (map) | Target (audit) |
|---|---|---|
| Classes | `mb-4 px-2 font-semibold text-lg tracking-tight` | `#202124` (`--foreground`), 16px, Google Sans (system fallback), semibold |
| Color | inherits (effectively muted/invisible-gray per audit) | explicit `--foreground` `#202124` |
| Glyph | none | optional small logo glyph left of wordmark |

**Change**
```tsx
<Link href="/" className="mb-4 flex items-center gap-2 px-2 text-[16px] font-semibold tracking-tight text-[var(--foreground)]">
  <span aria-hidden className="parchment-logo-glyph" /> {/* optional, --primary fill */}
  {t('shell.appName')}
</Link>
```
- Color → `text-[var(--foreground)]`; size `text-lg`→`text-[16px]` to hit the 16px target. Font family comes from the `--font-ui` Google-Sans stack **loaded by S1-8** (S2 only references the var). Glyph optional; if added it fills `--primary`.

**Accept**
- Wordmark is legible top-left, `#202124`, 16px semibold. **Proves it:** VR #2 files
  page (wordmark in frame). axe: contrast of wordmark text on white passes.

**Steps**
1. RED snapshot (faint wordmark).
2. Add `text-[var(--foreground)]` + 16px; optional glyph.
3. Live-verify legibility on deploy; axe contrast.
4. Update VR #2.

---

### S2-4 — Drop the duplicate Files-page view tab strip → sidebar rows  ⚠ PARTIAL

**Files**
- `src/components/file-manager/FileManager.tsx` — `VIEWS` array L52–58 (`All/Recents/Starred/Shared/Trash`); the **view-switcher tab bar** `<nav aria-label="views">` L2086–2109 (this is the strip to remove); the `view` React state + `setView` it drives.
- `src/app/(app)/layout.tsx` — nav array L17–23 (add the rows).
- Possibly NEW: route handlers or query wiring for non-`/files` views (see risk).

**Current → Target**
| Aspect | Current (map + verified code) | Target (audit) |
|---|---|---|
| Strip mechanism | **client `view` state** — tab click calls `setView(key)` (L2092–2096), NOT a route change. `aria-current` at L2098; active = `border-b-2 border-[var(--accent-contrast)]` | strip **removed** from files page |
| Views | All / Recents / Starred / Shared / Trash live as `view` state in `FileManager` | reachable from **sidebar nav rows** (Drive shape) |
| Files-page top | tab strip + SortViewToolbar | **title + Sort + View toggle only** (strip gone) |
| Routes that exist | only `/files`, `/templates`, `/inbox`, `/trash`, `/settings` (map). **No `/recents`, `/starred`, `/shared` routes.** | sidebar rows must reach each view |

**Change — and why this is PARTIAL.** The sidebar nav (S2-1) is **href routing**;
the files-page strip is **in-component state**. Moving the views into the sidebar
is therefore *not a pure restyle* — Recents/Starred/Shared have no URL today. Two
honest options:
- **(a) Restyle-only slice (fits S2 / pure visual):** remove the strip's tab-bar
  *chrome* and render the same `setView` switches as sidebar rows **only for the
  views that already have routes** (`Files`→`/files`, `Trash`→`/trash`), plus
  keep Recents/Starred/Shared switching *within* `/files` via query param
  (`/files?view=starred`) read by `FileManager`. Reading a query param into
  existing `view` state is wiring, not new feature behavior — borderline but
  defensible as "surface existing behavior."
- **(b) Full Drive parity:** mint real routes `/recents`, `/starred`, `/shared`.
  That is **new navigation surface = out of the v0.1.1 "no new features" rule**
  and outgrows one PR.

**Recommendation: scope S2-4 PARTIAL.** Ship slice (a): kill the duplicate tab-bar
chrome + add the sidebar rows + `?view=` query wiring for the routeless views.
Log the remaining "real dedicated routes" sub-part in scope.md as the unshipped
percent. Do **not** flip S2-4 to DONE on slice (a) alone.

**Single owner of the strip deletion (DECIDED — closes finding #18):** **S2-4 owns
moving the views into the sidebar nav AND deleting the `<nav aria-label="views">`
strip (L2086–2109).** S5-4 does **NOT** re-delete it — S5-4 only references that
S2-4 already removed it, and does its own file-row glyph/sort/dot work on the rest
of the page. S5-1's active-state restyle of that strip is also moot (the strip is
gone after S2-4) — S5-1 styles the **sidebar nav rows** instead. There is exactly
ONE delete of that JSX block, in S2-4.

**Hard ordering constraint (Failure-mode "Navless gap"):** never remove the strip
before the sidebar rows + `?view=` wiring are live, or the routeless views become
unreachable. Because S2 runs before S5, S2-4 must land the sidebar rows + `?view=`
wiring + strip removal **together in its own PR** (it does not need S5-4 to be
safe — the sidebar rows it adds are its own).

**Accept**
- No view tab strip renders on `/files`; All/Recents/Starred/Shared/Trash are each
  reachable (Files/Trash via route, Recents/Starred/Shared via sidebar row →
  `?view=`); files-page top is title + Sort + View toggle only.
- **Proves it:** VR #2 files page (no strip) + VR #3 file list; a navigation walk
  asserting all five views reachable from the sidebar. axe: the sidebar `views`
  remain a single labelled nav (no duplicate `aria-label="views"` after the
  in-component nav is removed).

**Steps**
1. RED: VR #2 + #3 showing the duplicate strip on `/files`.
2. Add the 7 sidebar rows (shared with S2-1) incl. Recents/Starred/Shared.
3. Wire `FileManager` to read `?view=` into existing `view` state (no new view logic).
4. Remove `<nav aria-label="views">` L2086–2109 + dead tab-bar styling; keep SortViewToolbar.
5. Live-verify ALL five views reachable from sidebar; assert no navless gap.
6. Mark **PARTIAL (n%)** in scope.md with the routeless-views remainder; update VR #2 + #3.

---

### S2-5 — Top-right user cluster

**Files**
- NEW component `src/components/shell/UserCluster.tsx` — 32px avatar (initial fallback) + account menu (client, ~90 LOC).
- `src/app/(app)/layout.tsx` — `<main>` L86–88 currently has no top chrome; add a top-bar slot anchoring `UserCluster` top-right of the content area (the app routes have no top bar today — this is a small NEW surface, sized below).
- `src/lib/auth/sign-out-button.tsx` — reuse its POST `/api/auth/logout` action inside the menu's "Sign out" row (do not author a second sign-out).

**Current → Target**
| Aspect | Current (map) | Target (audit) |
|---|---|---|
| Top-right account affordance | **none** — account actions only live in the sidebar bottom cluster | 32px avatar (initial fallback), top-right on app routes |
| Avatar click | n/a | menu: **Manage account** / **Sign out** / **Switch account** (placeholder) |
| App launcher | n/a | **no 9-dot launcher grid** |

**Change**
- `UserCluster` (NEW, **surfaces existing behavior only**):
  - Avatar = 32px circle; if `user.image` absent, render the initial of `user.name`
    (the **initial-fallback avatar** the Failure-modes call out). Reuse this same
    avatar component in the S2-2 sidebar cluster.
  - Menu rows: **Manage account** → navigate `/settings` (existing route);
    **Sign out** → call the existing logout action; **Switch account** → disabled
    placeholder (single-owner in v0.1; matches "Shared documents arrive in v0.2"
    posture in `FileManager` L2732). No new account logic.
  - Flat menu surface in S2; elevation/shadow = S5-3; tooltip on the avatar = S5-2.
- Top-bar slot: a minimal right-aligned strip above `{children}` in `layout.tsx`
  (~1 wrapper div). This is a **small new chrome surface, not a feature** — sized
  at ~1 component + ~10 lines of layout. (Contrast S3-2 menu bar, which is a large
  new shared-dropdown system flagged PARTIAL in S3 — S2-5 is intentionally tiny.)

**Accept**
- A 32px avatar (initial fallback when no image) sits top-right on app routes; click
  opens a Manage account / Sign out / (disabled) Switch account menu; **no app-launcher
  grid** anywhere. **Proves it:** VR #2 files page + VR #4 editor idle (avatar in
  top-right frame) + a snapshot of the **initial-fallback** avatar. axe: menu is
  keyboard-operable with focus trap/restore + Esc (the K3 lesson).

**Steps**
1. RED: VR #2/#4 showing no top-right account affordance.
2. Build `UserCluster` (avatar + initial fallback) reusing the logout action + `/settings` link.
3. Add the top-bar slot in `layout.tsx`; mount `UserCluster` top-right.
4. axe + Playwright keyboard walk: focus trap, Esc, restore; assert no 9-dot grid.
5. Live-verify on `/files` and an editor route; snapshot initial-fallback avatar.
6. Update VR #2 + #4 baselines.

---

### S2-6 — Responsive chrome (narrow-viewport behavior) ⚠ likely PARTIAL

**Files**
- `src/app/(app)/layout.tsx` — the `<aside>` sidebar (S2-1 widens it to 256px) +
  the S2-5 top-bar slot; add a collapse/overlay behavior + a hamburger trigger.
- `src/components/editor/Editor.tsx` — the editor chrome stack (S3-1 title 56 +
  S3-2 menu 32 + S3-3 toolbar 48 = ~136px of fixed chrome) needs a narrow-viewport
  treatment so the canvas + status bar stay usable on a phone.
- `src/app/globals.css` — media-query rules for the sidebar overlay + chrome stack.

**Why this is a NEW item (closes finding #10 / GAP).** Nothing today makes the new
global chrome responsive: `(app)/layout.tsx:64` renders `<aside class="flex w-56
shrink-0 …">` always visible, no media query, no collapse. S2-1 widens it to 256px
and S2-5 adds a top-bar slot; S3 stacks ~136px of editor chrome. On a phone
viewport a 256px fixed rail + top bar + 136px chrome makes the app unusable, and
the existing S2/S3 failure-modes only **snapshot** at 768px (verification), they do
not **build** adaptive behavior. S2-6 owns building it.

**Current → Target**
| Aspect | Current | Target |
|---|---|---|
| Sidebar at < 768px | always 256px, no collapse | **collapses to an overlay/drawer** behind a hamburger in the top bar; content goes full-width |
| Top bar (S2-5) | right-aligned cluster only | hosts the hamburger toggle on narrow viewports |
| Editor chrome stack (S3) | 136px fixed, no narrow treatment | title/menu/toolbar remain reachable (e.g. menu bar collapses into the toolbar `⋯`, or the toolbar's existing ResizeObserver overflow handles the narrow case) without pushing the canvas off-screen |

**Change:** add CSS media queries + a small client toggle for the sidebar
drawer/overlay (reuse the S2-5 top-bar slot for the hamburger). The editor chrome
leans on **S3-3's existing `⋯` overflow** (already in scope) for the toolbar; the
menu bar's narrow treatment is the genuinely-new piece. **No new feature logic** —
it is layout/visibility behavior on existing chrome. **Realistic scope: mark
PARTIAL** if full Drive-grade responsive (every breakpoint, the editor chrome
reflow) outgrows one PR — ship the sidebar drawer + content full-width first, log
the editor-chrome reflow remainder as the unshipped percent. Do **not** flip to
DONE on the sidebar slice alone.

**Accept:** at a phone width the sidebar is an overlay behind a hamburger, content
is full-width, and the editor canvas + slim status bar stay visible (no chrome
pushing them off-screen). **Proves it:** a **375px** (phone) responsive VR snapshot
of `/files` (sidebar collapsed) + the editor route (chrome usable); axe at 375px
(the hamburger has an accessible name; focus order sane). The existing 768px
snapshots in S2/S3 become the mid-breakpoint check.

**Steps**
1. RED: 375px snapshot of `/files` + editor showing the broken fixed-256px overflow.
2. Add the media queries + sidebar drawer/overlay + hamburger in the S2-5 top bar.
3. Wire the editor chrome narrow treatment (toolbar `⋯` from S3-3; menu-bar
   collapse) **or** log it PARTIAL with the percent.
4. Live-verify at 375px + 768px; axe at 375px.
5. Mark scope.md `PARTIAL (n%)` if the editor-chrome reflow is deferred; update the
   responsive baselines.

---

## Coverage check
- **Audit gaps closed:** cluttered/low-hierarchy sidebar (S2-1/2/3), duplicate
  in-component view nav (S2-4 sole owner), missing top-right account affordance
  (S2-5), faint wordmark (S2-3), **no responsive chrome (S2-6, finding #10)**,
  undefined help-menu CSS classes (`parchment-help-*` — styled where they appear in
  the bottom cluster; the *dialog* classes are restyled by **S5-11** dialog shell,
  noted below).
- **Map gaps this plan owns:** `parchment-help-menu-wrap` / `-dropdown` / `-menuitem`
  (HelpMenu L486/500/503+) get their first CSS here as part of the S2-2 icon-only
  Help + flat dropdown (consuming the S5-3 `.px-menu` shell, not a fresh one). The
  `parchment-help-*` **dialog** classes (backdrop/dialog/header/title/body,
  shortcuts table, release list, tour) are restyled by the **S5-11 shared dialog
  shell** — **logged, not dropped.**
- **Cross-plan:** the "+ New" mega-menu (S2-1) absorbs the standalone "+ New folder"
  purple button (deleted in S5-4) and uses S5-8 copy ("Blank document"/"Folder");
  nav active pill uses the canonical `--primary-surface`/`--primary`
  (`#E8F0FE`/`#1A73E8`); icons are Material Symbols **loaded by S1-8** (S2 only
  references the class); the `--font-ui` faces also come from **S1-8**. **Tab-strip
  removal is owned solely by S2-4** (finding #18); S5-4 references it, does not
  re-delete. Mega-menu / user-menu elevation = the **S5-3 shared `.px-menu` shell +
  `--shadow-dropdown`** (Decision 6) — S2 consumes it.
- **Out of scope (owned elsewhere):** per-row hover/pressed *pill behavior* → S5-1;
  tooltip *system* → S5-2 (S2 only adds accessible names); shared dropdown shell +
  elevation → S5-3; shared dialog shell → S5-11; type **ramp/sizing** → S4 (font
  **faces** + Material Symbols **loading** → S1-8); the editor-route doc-title bar
  and menu bar → S3.
- **Newly discovered (verified in code):** the "Files-page top tab strip" is a
  **client `view`-state switcher** in `FileManager.tsx` (L52–58, L2086–2109), not
  href routing, and Recents/Starred/Shared have **no routes**. This makes S2-4
  larger than a restyle → **PARTIAL** (see item). The app routes also have **no
  top bar today** → S2-5 adds a small new chrome slot (sized, not a feature).

## Failure-modes-verified
- **Navless gap** (view strip removed before sidebar rows + `?view=` wiring exist) →
  **S2-4 is the sole owner** and ships the sidebar rows + `?view=` wiring + strip
  removal **in one PR**; live screenshot must show all five views reachable from the
  sidebar before the in-component `<nav aria-label="views">` (L2086–2109) is
  deleted. S5-4 does not touch the strip.
- **Mega-menu / user-menu a11y** (K3 lesson — keyboard-operable, focus trap/restore,
  Esc) → axe + Playwright keyboard walk of the "+ New" mega-menu and the
  `UserCluster` account menu.
- **Active-route detection wrong** (pill on wrong row / none, or server component
  can't read pathname) → the active pill is computed in a **client `NavRow`**
  wrapper via `usePathname` (layout is async server); snapshot each nav row in its
  active state; assert exactly one active pill per route.
- **Icon-only Help nameless** (dropping the "Help" text removes the accessible name)
  → axe asserts the `?` Help button has an `aria-label`/`title`; no "button has no
  accessible text" violation.
- **Avatar fallback** (no image → blank vs initial) → snapshot the initial-fallback
  `UserCluster` avatar; the same avatar reused in the S2-2 sidebar cluster.
- **Width/border regressions on narrow viewports** → **S2-6 owns building the
  narrow-viewport behavior** (sidebar drawer/overlay + hamburger); responsive
  snapshots at **375px** (sidebar collapsed, content full-width) AND 768px
  (the G12 page-fit lesson — no ResizeObserver feedback loop). A fixed 256px rail at
  phone width is a defect S2-6 fixes, not a "content flexes" hand-wave.
- **Hardcoded-hex regression** (a literal slipping in instead of an S1 token) →
  grep `src/` for the audit literals (`#E8F0FE`, `#DADCE0`, `#202124`, `#5F6368`,
  `#1A73E8`) in component files returns zero; every value resolves through a
  `--var` (S1 Failure-mode parity).
