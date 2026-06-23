# Plan S2 — Global chrome (nav rails, top bar, sidebar)

> ⛔ HOLD. Run after S1 (consumes its tokens).

**Intent:** restyle the global shell to Google Drive shape — white sidebar with a
giant "+ New" mega-menu, Material nav rows, a real wordmark, and a top-right user
cluster. The Files-page top tab strip moves INTO the sidebar.

**Likely files:** `src/app/(app)/layout.tsx` (the sidebar shell), a new
`NewMenu` mega-menu component, nav-row components, `src/components/help/HelpMenu.tsx`
(bottom cluster), a top-bar user-cluster component, the file-manager top area
(`FileManager.tsx`) for the tab-strip removal.

---

### S2-1 — Left sidebar → Drive shape
White bg, 1px right border `#DADCE0`, 256px default width. Top: small Parchment
wordmark + ▾ workspace-switcher chip (avatar + name), 56px tall. Below: **giant
"+ New"** button — 56px tall, white, 16px rounded, `box-shadow:0 1px 3px rgba(60,64,67,.15)`,
hover `0 1px 6px rgba(60,64,67,.20)`, multicolor plus icon; click → mega-menu
(Blank document / From template / Folder / Upload). Below: nav rows — 20px Material
icon + 14px text + 12px horizontal padding + 36px row height: Files / Templates /
Inbox / Shared / Starred / Trash / Settings. Active row = light blue pill `#E8F0FE`
+ blue text. **Accept:** sidebar matches Drive layout; mega-menu opens the 4 actions.

### S2-2 — Sidebar bottom cluster
Avatar + name row tight at bottom. Language dropdown muted. `?` Help icon-only +
tooltip. Sign-out muted, red on hover. Drop equal-weight gray for hierarchy.
**Accept:** bottom cluster reads as secondary; Help is icon-only with a tooltip.

### S2-3 — Parchment wordmark
From invisible-gray → `#202124`, 16px Google Sans (system fallback) semibold;
optional small logo glyph left of it. **Accept:** wordmark legible, top-left.

### S2-4 — Drop the duplicate Files-page top tab strip
Move All / Recents / Starred / Shared / Trash into the sidebar as nav rows (Drive
shape). Files-page top becomes title + Sort + View toggle only. **Accept:** no top
tab strip on /files; those views reachable from sidebar rows. (Ties S5-4.)

### S2-5 — Top-right user cluster
32px avatar (initial fallback), click → menu (Manage account / Sign out / Switch
account placeholder). No 9-dot app launcher. **Accept:** avatar menu present
top-right on app routes; no app-launcher grid.

---

## Coverage check
- Audit gaps closed: cluttered/low-hierarchy sidebar (S2-1/2/3), duplicate nav
  (S2-4 + S5-4), missing top-right account affordance (S2-5).
- Cross-plan: the "+ New" mega-menu (S2-1) absorbs the standalone "+ New folder"
  purple button (S5-4) and uses S5-8 copy ("Blank document" / "Folder"); nav active
  pill uses S1 `#E8F0FE`/`#1A73E8`; icons are S4-3 Material Symbols. Tab-strip
  removal is shared with S5-4 — S2-4 owns the sidebar rows, S5-4 owns the files-page
  top area; both must land together to avoid a navless gap.
- Out of scope: per-row hover/pressed pills → S5-1; tooltips → S5-2; dropdown
  elevation of the mega-menu → S5-3.

## Failure-modes-verified
- **Navless gap** (tab strip removed before sidebar rows exist) → S2-4 and S5-4
  ship in one PR or with a guarded order; live screenshot must show all five views
  reachable from the sidebar.
- **Mega-menu a11y** (the K3 lesson — keyboard-operable, focus trap/restore, Esc) →
  axe + Playwright keyboard walk of the New mega-menu and the user-cluster menu.
- **Active-route detection wrong** (pill on the wrong row, or none) → snapshot each
  nav row in its active state; assert exactly one active pill per route.
- **Avatar fallback** (no image → blank vs initial) → snapshot the initial-fallback avatar.
- **Width/border regressions on narrow viewports** → responsive snapshot at 768px
  (the G12 page-fit lesson — no ResizeObserver feedback loop reintroduced).
