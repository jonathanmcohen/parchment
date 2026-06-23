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
