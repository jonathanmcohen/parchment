# Bundled fonts

## OpenDyslexic

`opendyslexic-regular.woff2` (400) and `opendyslexic-bold.woff2` (700) ship the
OpenDyslexic typeface used by the K2 "Dyslexia-friendly font" appearance toggle.

- **Project:** OpenDyslexic — https://opendyslexic.org/
- **Source repo:** https://github.com/antijingoist/opendyslexic
- **License:** SIL Open Font License 1.1 (OFL) — freely redistributable, including
  bundling and self-hosting. See https://openfontlicense.org/
- **How these were obtained:** the latin 400/700 `woff2` subsets distributed via the
  `@fontsource/opendyslexic` package on the jsDelivr CDN, copied into this directory
  so the app serves them itself (NO external CDN at runtime — privacy: a self-hosted
  Parchment instance never phones home for a font).

The `@font-face` declarations live in `src/app/globals.css` (search `OpenDyslexic`),
with `font-display: swap` and a system dyslexia-friendly fallback stack so the
toggle still degrades gracefully if these binaries are ever removed.

## Roboto / Roboto Mono / Material Symbols (S1-8)

The Google-Docs UI stack is self-hosted here so the chrome never phones home for a
font (same privacy stance as OpenDyslexic above):

- `roboto-400.woff2` / `roboto-500.woff2` / `roboto-700.woff2` — Roboto regular /
  medium / bold (the `--font-ui` fallback after the non-redistributable Google Sans).
- `roboto-mono-400.woff2` — Roboto Mono (the `--font-mono` default).
- `material-symbols-rounded.woff2` — the Material Symbols Rounded variable font
  (the `.material-symbols-rounded` glyph class; FILL/wght/GRAD/opsz axes).

- **License:** Roboto + Roboto Mono are under the SIL Open Font License 1.1
  (`roboto-LICENSE.txt`); Material Symbols is Apache-2.0 (`material-symbols-LICENSE.txt`).
  All three are freely redistributable / self-hostable.
- **How these were obtained:** copied from the `@fontsource/roboto`,
  `@fontsource/roboto-mono`, and `material-symbols` npm packages (those packages are
  build-time sources only and are NOT runtime dependencies — the binaries live here).
  The icon SVG vector source for the S4 `<Icon>` wrapper is the `@material-symbols/svg-400`
  dependency (Apache-2.0), not a CDN.

The `@font-face` blocks + the `.material-symbols-rounded` base class live in
`src/app/globals.css` (search `S1-8`); the `--font-ui` / `--font-body` / `--font-mono`
token defaults live in `src/styles/tokens.css`. `font-display: swap` (text) /
`block` (icons) keeps layout stable; the S4 type ramp builds on these faces.
