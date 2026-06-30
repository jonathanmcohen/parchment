// v0.2.7 #4b: bundled Google Fonts catalogue.
//
// A curated, static allow-list of popular Google Fonts families. Bundling the
// catalogue (rather than calling the Google Fonts Developer API at runtime) means
// the PICKER can search the catalogue with ZERO network calls — neither the client
// nor the server contacts Google just to LIST fonts. The only outbound request ever
// made is the server-side, on-demand fetch of a single picked font's woff2 (see
// google-fonts.ts), and that is gated to THIS list — which is also the SSRF guard:
// the server will only ever fetch a family that appears here.
//
// All OFL/Apache-licensed and freely servable. Curated for breadth (sans, serif,
// slab, mono, display, handwriting) so the picker is genuinely useful without
// shipping the entire 1500+ family catalogue.

/** Curated, allow-listed Google Fonts families (the SSRF allow-list + picker list). */
export const GOOGLE_FONT_FAMILIES: readonly string[] = [
  // Sans-serif
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Nunito',
  'Nunito Sans',
  'Work Sans',
  'Source Sans 3',
  'Noto Sans',
  'Mukta',
  'Rubik',
  'Karla',
  'DM Sans',
  'Manrope',
  'Public Sans',
  'Outfit',
  'Figtree',
  'Plus Jakarta Sans',
  'Albert Sans',
  'Be Vietnam Pro',
  'Hanken Grotesk',
  'Onest',
  'Schibsted Grotesk',
  // Serif
  'Merriweather',
  'Playfair Display',
  'Lora',
  'PT Serif',
  'Noto Serif',
  'Source Serif 4',
  'EB Garamond',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Crimson Text',
  'Bitter',
  'Spectral',
  'Frank Ruhl Libre',
  'Newsreader',
  'Fraunces',
  'Literata',
  'Zilla Slab',
  // Slab / display
  'Roboto Slab',
  'Arvo',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Archivo',
  'Archivo Black',
  'Righteous',
  'Comfortaa',
  'Josefin Sans',
  'Abril Fatface',
  'Lobster',
  'Pacifico',
  // Monospace
  'Roboto Mono',
  'JetBrains Mono',
  'Source Code Pro',
  'IBM Plex Mono',
  'Space Mono',
  'Fira Code',
  'Inconsolata',
  // Handwriting
  'Caveat',
  'Dancing Script',
  'Shadows Into Light',
  'Satisfy',
]

/** O(1)-ish membership check for the SSRF allow-list (exact family-name match). */
const FAMILY_SET = new Set(GOOGLE_FONT_FAMILIES)

/** True when `family` is an exact match in the bundled catalogue (the SSRF gate). */
export function isAllowedGoogleFont(family: string): boolean {
  return FAMILY_SET.has(family)
}

/**
 * Case-insensitive substring search over the catalogue for the picker. Empty query
 * returns the whole list (alphabetised-by-popularity as authored). `limit` caps
 * results for the popover.
 */
export function searchGoogleFonts(query: string, limit = 60): string[] {
  const q = query.trim().toLowerCase()
  const matches =
    q.length === 0
      ? [...GOOGLE_FONT_FAMILIES]
      : GOOGLE_FONT_FAMILIES.filter((f) => f.toLowerCase().includes(q))
  return matches.slice(0, limit)
}
