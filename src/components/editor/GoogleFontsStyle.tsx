'use client'

// v0.2.7 #4b: inject @font-face blocks for the workspace's PICKED Google fonts.
//
// Each block points ONLY at the local proxy route (/api/fonts/google/<slug>.woff2),
// never at Google — so the browser self-hosts. Mounted app-wide (in the (app)
// layout) with the server-read picked-fonts list so ANY document that uses a picked
// font renders correctly across reloads, and the toolbar's added entries resolve.
//
// The CSS is built by googleFontFacesCss, which filters to the allow-list — a forged
// family name can never produce a font reference here. It contains no user HTML
// (only family names already constrained to the catalogue), so the static
// dangerouslySetInnerHTML is safe.

import { googleFontFacesCss } from '@/lib/fonts/google-fonts'

export function GoogleFontsStyle({ families }: { families: readonly string[] }) {
  if (families.length === 0) return null
  const css = googleFontFacesCss(families)
  if (css.length === 0) return null
  // biome-ignore lint/security/noDangerouslySetInnerHtml: generated @font-face from allow-listed family names only — no user HTML.
  return <style data-google-fonts="" dangerouslySetInnerHTML={{ __html: css }} />
}
