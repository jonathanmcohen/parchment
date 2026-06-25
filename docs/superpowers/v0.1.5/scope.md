# Parchment v0.1.5 — scope

```
╔══════════════════════════════════════════════════════════════════════════╗
║  🛠  IN PROGRESS — v0.1.5. Per-item PRs onto release/v0.1.5.               ║
║  User: "everything should be fixed in 0.1.5" → 6 reported + 3 polish tiers.║
║  Discipline (carries v0.1.0–v0.1.4): reproduce-first WITH EVIDENCE → fix   ║
║  + test → browser-verify (light AND dark) → CI green → user redeploys →    ║
║  controller final live-confirm. No item DONE without a browser/probe       ║
║  artifact. No "0 PARTIAL" claim. Name every PARTIAL.                       ║
╚══════════════════════════════════════════════════════════════════════════╝
```

User-reported editor/theme issues + a full design-polish sweep, post-v0.1.4.
Grounded by a 9-agent discovery workflow (reproduce-first + fix-design + polish
scouting) + controller live reproduction of the visual items on the deploy.

## Decisions (locked with user)
- **Breadth**: EVERYTHING — the 6 reported items + all 3 polish tiers.
- **I4 page layout**: continuous stays the DEFAULT (no surprise for existing
  docs); paged-with-gaps is an opt-in toggle in **Workspace → Appearance**,
  applying **per-workspace**. New setting `pageLayoutMode: 'continuous'|'paged'`.
- **I3 system theme**: resolve consistently via **CSS-only** (mirror dark/light
  under `[data-color-scheme="system"]` + `@media(prefers-color-scheme)`, fix the
  body) — NOT a client matchMedia read in render (avoids the V5 hydration trap).

## Reported items
| # | Item | Sev | Effort | Root cause (confirmed) | Fix |
|---|---|---|---|---|---|
| I1 | toolbar horizontal scroll | med | medium | toolbar `max-w-5xl` (1024px) holds 47 controls = 2579px → scroll; overflow "⋯" only collapses 5 low-pri controls; wide Font/Size/Line/Spacing selects stay inline (live: 1555px hidden) | widen toolbar to full chrome width + extend overflow to collapse the format group on narrow widths; drop/constrain the `overflow-x:auto` safety net |
| I2 | code block illegible in dark | high | small | `DEFAULT_THEME='github-light'` Shiki theme hardcoded (`shiki/highlighter.ts:27`) → light token colors any scheme; block fg doesn't flip (live: `#202124` on gray) | select Shiki theme by `data-color-scheme` (github-dark in dark; resolve system); ensure block fg/bg flip; re-decorate on scheme change |
| I3 | "system" = inconsistent mix | med | small | no `[data-color-scheme="system"]` prefers-color-scheme rule; system-light inherits `:root`, system-dark uses `@media` → 2 paths; **`body` stays white under system** (live confirmed) | CSS-only: mirror dark+light token overrides under `system @media`, flip body/root; ensure inline themeCssVars don't shadow |
| I4 | Word-like page gaps + toggle | med | medium | B1 = continuous canvas, breaks are overlay markers (no sheet separation) | paged mode = discrete white sheets on the `--editor-gutter` + ~32px gap + shadow; `pageLayoutMode` setting (continuous default), Workspace Appearance, settings-repo persist |
| I5 | About outside settings | med | small | About → `/whats-new` (own route), not in settings shell | create `/settings/about` rendering RELEASE_NOTES in the settings shell; point nav; 301 `/whats-new`→`/settings/about` |
| I6 | editor rename not live in /files | high | small | sidebar/files page-tree RSC cached at `(app)/layout`; rename PATCH never revalidates | `revalidatePath('/(app)','layout')` (or router.refresh) after rename → instant |

## Polish tiers (user: include all)
**T1 — dark-mode token sweep** (hardcoded light colors that don't flip; same class as v0.1.4 V1):
- error text `#dc2626` → `var(--error)` across AutosaveSlider/SpellingSettings/ShortcutsSettings/AppearanceSettings/StylesManager
- PrintView overlay hardcoded `#f0f0f0/#fff/#1a1a1a/...` → tokens
- MermaidView/PlantumlView error + loading/placeholder states (`#fff8f8/#fcc/#c00`, `#f9f9f9/#eee/#999`) → tokens
- VersionHistory diff colors (`#22c55e/#166534`, `#3b82f6/#1d4ed8`) → dark-aware tokens
- ReadingPresence cursor border `rgba(0,0,0,.15)` → scheme-aware
- CrossRefPicker inline grays → tokens
- HealthPills/BackupControls status hex → tokens
- `.px-tip` tooltip dark-mode contrast

**T2 — editor chrome quick wins** (P1):
- menu-bar `:focus-visible` ring; save-status reserves space when idle (don't shift layout); toolbar separators invisible in dark (`--border`→stronger); suggesting "ON" badge unstyled; title-input border/contrast in dark; toolbar select/input height vs button height; disabled opacity in dark; misc micro-alignment

**T3 — settings/files polish** (P3):
- settings section dividers; "Saved ✓" success feedback (AccountNameSetting/AutosaveSlider); breadcrumb truncation on narrow; empty/loading state visuals (PATManager/SessionsList/CustomDictionaryManager); settings spacing rhythm + responsive padding; sortable-column hints on inactive columns; popover/context-menu entrance animation + viewport clamp; NavRow hover affordance

## Execution
Per-item (or per-tier) branch off `release/v0.1.5` → reproduce-first → fix (+ test where logic) → biome+tsc+vitest → browser-verify on the deploy (light AND dark) → PR → squash-merge → ledger. Theme items (I2/I3/T1) verified in BOTH schemes. Final whole-branch adversarial review before tag. Trivial CSS done solo (the v0.1.3/v0.1.4 lesson: implement-agents garbage-fail on CSS); heavier logic (I1 overflow, I4 paged) get more care.
