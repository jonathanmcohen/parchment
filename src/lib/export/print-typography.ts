// v0.2.7 #5: print/PDF typography that MATCHES the on-screen editor.
//
// The print path (PrintView → PaginatedDocument) renders a read-only document and
// styles it with EXPORT_STYLESHEET (Georgia serif / 1.05rem / 1.7) — the same
// stylesheet used by the standalone HTML + EPUB export. The live editor instead
// styles prose via `.parchment-prose` (var(--font-body) / 11pt / 1.15). The two
// diverge by face + ~15% size + ~48% leading, so the SAME paragraphs wrap to a
// different number of lines → different page breaks and a different vertical
// position on every printed page. That is the "printed text doesn't line up with
// the editor" bug.
//
// Fix: emit a PRINT-SCOPED stylesheet (every rule under `.parchment-print-overlay`)
// that re-imposes the editor's prose typography on the printed content, WITHOUT
// touching the shared EXPORT_STYLESHEET (so HTML/EPUB export is unchanged). It is
// appended AFTER EXPORT_STYLESHEET in PrintView so it wins by source order +
// higher specificity. The printed content is additionally given the
// `.parchment-prose` class by PaginatedDocument so these selectors bind.
//
// The font itself comes from the workspace theme. PrintView resolves the live
// `--font-body` / `--font-heading` (Arial by default, whatever the user picked
// otherwise — and, once a real licensed default ships, that) off the editor and
// sets them as CSS vars on the overlay; these rules consume them via var().

/** Print-only stylesheet mirroring the editor's `.parchment-prose` typography. */
export const PRINT_TYPOGRAPHY_CSS = `
/* v0.2.7 #5 — print typography mirrors the editor (.parchment-prose) so line
   wrapping + page breaks match what you see while editing. Scoped to the print
   overlay; the shared EXPORT_STYLESHEET (HTML/EPUB) is untouched. */
.parchment-print-overlay .parchment-prose {
  font-family: var(--font-body, Arial, sans-serif);
  font-size: 11pt;
  line-height: 1.15;
  color: #1a1a1a;
}
.parchment-print-overlay .parchment-prose h1,
.parchment-print-overlay .parchment-prose h2,
.parchment-print-overlay .parchment-prose h3,
.parchment-print-overlay .parchment-prose h4,
.parchment-print-overlay .parchment-prose h5,
.parchment-print-overlay .parchment-prose h6 {
  font-family: var(--font-heading, var(--font-body, Arial, sans-serif));
}
`

/**
 * The inline CSS-variable style for the print overlay, propagating the editor's
 * resolved font vars into the body-level portal (the (app) wrapper's inline
 * themeCssVars do NOT reach a `document.body` portal). Pass the values read from
 * the live editor via getComputedStyle. Empty/blank values are dropped so the
 * tokens.css `:root` defaults still apply.
 */
export function printOverlayFontVars(fonts: {
  fontBody?: string
  fontHeading?: string
}): Record<string, string> {
  const vars: Record<string, string> = {}
  const body = fonts.fontBody?.trim()
  const heading = fonts.fontHeading?.trim()
  if (body) vars['--font-body'] = body
  if (heading) vars['--font-heading'] = heading
  return vars
}
