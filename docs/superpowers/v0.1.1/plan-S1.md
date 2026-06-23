# Plan S1 — Color, theme tokens, surfaces

> ⛔ HOLD. The token foundation every later plan consumes. Land S1 first.

**Intent:** kill the purple/cream identity, install the Google palette as CSS
vars, and make page surfaces read as white-on-gray like Google Docs. All later
plans reference the S1 vars — no hardcoded hex after S1.

**Likely files:** new `src/styles/tokens.css` (imported by `globals.css`),
`src/app/globals.css` (consume vars, drop cream literals), `tailwind.config`
(map theme colors to the vars), `src/lib/editor/theme.ts` (G3/I1 theme — accent
default → Google Blue), the collab-cursor styles (`globals.css` caret rules).

---

### S1-1 — Primary purple → Google Blue `#1A73E8`
Tokens `--primary` `#1A73E8`, `--primary-hover` `#1765CC`, `--primary-pressed`
`#185ABC`. Apply: primary buttons, active tab indicators, breadcrumb hovers, body
link color (`#1A73E8`), accent rails. **Accept:** no purple (`#6d28d9` / the old
accent) remains on any chrome surface; primary controls render Google Blue.

### S1-2 — Page-outside background `#F1F3F4`
The editor canvas wrapper bg becomes `#F1F3F4` so the white page edge is visible.
**Accept:** editor route shows a gray gutter around a white page.

### S1-3 — Page canvas pure white + Docs shadow
Canvas `#FFFFFF`, shadow `0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.30)`.
**Accept:** page is pure white with the two-layer Docs drop shadow on the gray gutter.

### S1-4 — Drop cream surfaces
`--surface` cream → white; `--surface-muted` cream → `#F8F9FA`. Sweep all cream
literals. **Accept:** grep finds no cream hex in `src/`; every surface white or `#F8F9FA`.

### S1-5 — Selection + collab cursors
Text selection `background:#D2E3FC; color:inherit`. Collab carets use accent blue
+ a per-user hue. **Accept:** selecting text shows the Docs blue highlight; a 2nd
collab client renders a distinct-hue caret.

### S1-6 — Focus ring
`outline:2px solid #1A73E8; outline-offset:2px` on every focusable control
(supersedes the K3 ring). **Accept:** Tab through chrome + editor → every focused
control shows the 2px blue offset ring; axe focus-visible clean.

### S1-7 — Token file `src/styles/tokens.css`
All colors as CSS vars in one file (or the Tailwind config), so Settings →
Account → Theme (light / dark / follow-system) stays a clean var swap. **Accept:**
toggling the theme re-maps the vars only; no component hardcodes a color.

---

## Coverage check
- Audit gaps closed: purple identity (S1-1), cream surfaces (S1-2/3/4), selection
  + focus affordances (S1-5/6), themability foundation (S1-7).
- Cross-plan: S1-7 is consumed by S2 (sidebar surfaces), S3 (editor chrome), S4
  (text colors), S5 (hover/pressed pills). If a later plan needs a color, it adds
  a var to S1-7's file — never a literal. ✔ no color gap left unowned.
- Out of scope here (owned elsewhere): font tokens → S4; spacing tokens → S4-4;
  hover/pressed pill *behavior* → S5-1 (S1 only supplies the colors).

## Failure-modes-verified
- **Cream/purple residue** (a hardcoded hex the var swap misses) → per-item grep
  for the old hex in `src/` returns zero + the live-deploy screenshot of each
  surface shows no purple/cream.
- **Dark mode regression** (the I1 forced-scheme bleed lesson — vars set on the
  wrapper not propagating) → visual snapshot of settings→theme in light AND dark;
  the body/gutter must take the scheme, not just the inner div.
- **Selection contrast** (`#D2E3FC` highlight under dark theme washing out text) →
  axe contrast on selected text in both schemes.
- **Focus ring removed without replacement** (the recurring `outline:none` trap) →
  axe + a Playwright keyboard-tab snapshot asserting a visible ring on each focusable.
- **Theme toggle breaks** (a literal that doesn't follow the var) → toggle
  light/dark/system on the deploy and snapshot all three; vars must be the only thing changing.
