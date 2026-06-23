# Plan S4 — Typography + spacing

> ⛔ HOLD. Run after S3. Type ramp + font stack + spacing grid.

**Intent:** match Google Docs typography — Google Sans/Roboto chrome, Arial body,
a pt-based type ramp on the rendered content — and a consistent spacing grid.
Drop Inter. The **markdown serializer must round-trip unchanged** (S4-2 is CSS
classes on the rendered ProseMirror output, not a doc-model change).

**Likely files:** `src/styles/tokens.css` / `tailwind.config` (font + spacing
tokens), `src/app/globals.css` (`.parchment-prose` type ramp + `@page`), the
self-hosted font assets (`public/fonts/` — add Roboto / Roboto Mono / Material
Symbols, OFL/Apache, no CDN — mirroring the K2 OpenDyslexic precedent), `@material-symbols/svg-400` for icons.

---

### S4-1 — Font stack
- UI: `"Google Sans","Roboto",system-ui,-apple-system,BlinkMacSystemFont,sans-serif`.
- Body: `Arial, sans-serif` (Docs default) — Font dropdown (S3-3) lists Arial first.
- Mono/code: `"Roboto Mono","Menlo",monospace`.
- Drop Inter from the UI; remove from the Tailwind font extend.
**Accept:** computed UI font = Google Sans/Roboto; body = Arial; code = Roboto Mono;
grep finds no `Inter` reference. Fonts self-hosted (no external font request).

### S4-2 — Type ramp (page content)
Title 26pt Arial bold `#202124` (mt 12 mb 8) · Subtitle 16pt Arial regular `#5F6368` ·
H1 20pt bold (mt 20 mb 6) · H2 16pt bold (mt 18 mb 6) · H3 14pt bold (mt 16 mb 4) ·
H4–6 12pt bold/italic/regular · Body 11pt Arial, line-height 1.15, `#202124`. Wire as
CSS classes on the rendered ProseMirror output. **Accept:** rendered doc matches the
ramp; export round-trip (md → parse → md) is byte-identical to pre-S4 (ramp is
presentation only).

### S4-3 — Toolbar / chrome typography
Menu-bar items 14px Roboto regular; toolbar dropdown text 14px Roboto regular; icons
20px **Material Symbols Rounded** (`@material-symbols/svg-400`). **Accept:** chrome
text = 14px Roboto; icons render from Material Symbols at 20px.

### S4-4 — Spacing tokens
Grid 4/8/12/16/20/24/32/40/56. Sidebar row 36px. Toolbar icon button **32×32 with
20px icon** (not 16px). Page canvas margin `@page` 1in default; A4 toggle (Page
setup) keeps 2.54cm. **Accept:** spacing tokens exist + applied; icon buttons 32×32/20px;
`@page` default 1in, A4 = 2.54cm.

---

## Coverage check
- Audit gaps closed: Inter/mismatched fonts (S4-1), no Docs type ramp (S4-2),
  inconsistent chrome text + non-Material icons (S4-3), ad-hoc spacing (S4-4).
- Cross-plan: S4-3 icons feed S2 nav rows + S3 toolbar/menu (which referenced "20px
  Material" — S4-3 is the single source); spacing tokens (S4-4) back S2-1 row heights
  + S3 icon buttons + S5 pills; colors come from S1 (S4 owns size/weight/family only).
- Out of scope: color tokens → S1; the doc model / markdown format → unchanged
  (S4-2 is render-CSS, explicitly verified by the round-trip).

## Failure-modes-verified
- **Markdown round-trip drift** (the H/F serializer lessons) → a test asserts
  `serialize(parse(serialize(doc)))` is byte-identical before/after S4; S4-2 must not
  touch the doc model.
- **Missing/CDN font** (the K2 precedent — ship the woff2, no external request) →
  verify `public/fonts/*` present + valid; network panel on the deploy shows no
  external font fetch; a fallback stack renders if a face is missing.
- **Icon-set swap breakage** (Material Symbols not loading → blank/tofu glyphs) →
  snapshot the toolbar + sidebar; every icon renders a glyph, none missing.
- **pt vs px mismatch** (the ramp specified in pt but CSS in px) → assert the
  rendered sizes match the pt spec (1pt ≈ 1.333px) on the deploy.
- **Build/bundle** (font + icon imports breaking Turbopack — the recurring lesson) →
  `pnpm build` compiles; the icon package isn't pulled onto the `getSchema` server path.
