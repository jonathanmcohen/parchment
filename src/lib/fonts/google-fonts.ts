// v0.2.7 #4b: privacy-preserving Google Fonts support.
//
// PRIVACY GUARANTEE (the whole point): the BROWSER must never load anything from
// Google. When a user picks a Google font, its woff2 is fetched ONCE by THIS
// server (from fonts.gstatic.com), cached on disk, and served from the app's own
// origin via `/api/fonts/google/<family>.woff2`. The `@font-face` the client sees
// only ever references the local origin. This mirrors the existing self-hosted
// @fontsource → public/fonts pipeline and keeps Parchment's documented "never
// phones home for a font" promise.
//
// SSRF SAFETY: the server only ever fetches a family that is in the bundled
// allow-list (GOOGLE_FONT_FAMILIES). The family name from the client is validated
// against that list before any outbound request, and the gstatic URL is taken from
// Google's own CSS response (not built from user input), so the client can never
// steer the server to an arbitrary URL.
//
// This module is PURE (no fs, no network) so it is fully unit-testable; the route
// + the disk cache live in the route handler / a thin server module.

import { GOOGLE_FONT_FAMILIES, isAllowedGoogleFont } from '@/lib/fonts/google-catalog'

export { GOOGLE_FONT_FAMILIES, isAllowedGoogleFont }

/**
 * A slug safe for a URL path + a cache filename, derived from a family name.
 * Lowercase, spaces→'-', strips anything but [a-z0-9-]. Stable + collision-free
 * across the curated catalog (no two families slug to the same value).
 * e.g. "Source Serif 4" → "source-serif-4", "EB Garamond" → "eb-garamond".
 */
export function fontSlug(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/** Reverse a slug back to its catalog family name, or null if not in the catalog. */
export function familyFromSlug(slug: string): string | null {
  const s = slug.toLowerCase()
  return GOOGLE_FONT_FAMILIES.find((f) => fontSlug(f) === s) ?? null
}

/**
 * The Google Fonts CSS2 API URL for a family. We request woff2 by sending a
 * modern User-Agent (done in the route). Only the family + a small weight set is
 * requested. `family` MUST already be allow-list-validated by the caller.
 */
export function googleCssApiUrl(family: string, weights: number[] = [400, 700]): string {
  const w = [...new Set(weights)].sort((a, b) => a - b).join(';')
  // The css2 API uses literal `+` (space), `:`, `@`, `;` in the family spec — do
  // NOT percent-encode them (Google rejects the encoded form). Only the SPACE→'+'
  // substitution is needed; family names in the allow-list contain just letters,
  // digits and spaces, so no other character needs escaping.
  const spec = `${family.replace(/ /g, '+')}:wght@${w}`
  // display=swap matches the app's self-hosted faces (font-display:swap).
  return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`
}

/**
 * Extract the FIRST woff2 URL from a Google Fonts CSS2 response. Google returns a
 * series of `@font-face { ... src: url(https://fonts.gstatic.com/....woff2) format('woff2') }`
 * blocks; we take the first woff2 src. Returns null if none found (e.g. an error
 * page). The returned URL is always on fonts.gstatic.com (validated by the caller).
 */
export function firstWoff2Url(css: string): string | null {
  const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)
  return m?.[1] ?? null
}

/** True when a URL is a fonts.gstatic.com woff2 (defense-in-depth for the fetch). */
export function isGstaticWoff2(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' && u.hostname === 'fonts.gstatic.com' && u.pathname.endsWith('.woff2')
    )
  } catch {
    return false
  }
}

/** The LOCAL (same-origin) URL the client uses for a picked Google font. */
export function localFontUrl(family: string): string {
  return `/api/fonts/google/${fontSlug(family)}.woff2`
}

/**
 * The CSS `@font-face` block for a picked Google font, pointing ONLY at the local
 * proxy route (never gstatic). `weight: 100 900` so one served file covers the
 * range the browser can synthesise; font-display:swap matches the bundled faces.
 */
export function googleFontFace(family: string): string {
  // Family names in the catalog are plain (letters/spaces/digits); quote to be safe.
  const safe = family.replace(/["\\]/g, '')
  return `@font-face{font-family:"${safe}";src:url("${localFontUrl(family)}") format("woff2");font-weight:100 900;font-display:swap;}`
}

/** The CSS font-family STACK applied to text using a picked Google font. */
export function googleFontStack(family: string): string {
  const safe = family.replace(/["\\]/g, '')
  return `"${safe}", sans-serif`
}

/** Build a combined <style> body of @font-face blocks for a set of picked fonts. */
export function googleFontFacesCss(families: readonly string[]): string {
  return families.filter(isAllowedGoogleFont).map(googleFontFace).join('\n')
}
