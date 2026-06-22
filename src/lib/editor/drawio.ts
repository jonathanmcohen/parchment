/**
 * G6c — Drawio helper (pure, no React/db).
 *
 * Drawio embed editing is enabled ONLY when `NEXT_PUBLIC_DRAWIO_EMBED_URL` is
 * set. Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle, so both
 * the server and client can read this value without an extra API call.
 *
 * When the env var is unset (the default), `drawioEnabled()` returns false and
 * the editor shows a muted "disabled" message instead of the iframe. This mirrors
 * the E9 semantic-search / G6b PlantUML env-gate pattern.
 *
 * Usage:
 *   NEXT_PUBLIC_DRAWIO_EMBED_URL=https://embed.diagrams.net
 */

/**
 * Returns the configured drawio embed base URL, or null when unset (disabled).
 * Both server-side and client-side code may call this safely.
 */
export function drawioEmbedUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_DRAWIO_EMBED_URL
  return u ? u : null
}

/**
 * Returns true when a drawio embed URL has been configured.
 */
export function drawioEnabled(): boolean {
  return !!drawioEmbedUrl()
}

/**
 * Build the iframe src for the drawio embed, appending the required query
 * parameters to the base URL:
 *   embed=1      — enable the embed protocol
 *   proto=json   — postMessage JSON mode
 *   spin=1       — loading spinner
 *   libraries=1  — show shape libraries
 *   saveAndExit=1 — show Save & Exit button
 *   noSaveBtn=0  — do NOT hide the save button
 */
export function drawioEmbedSrc(base: string): string {
  const url = new URL(base)
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('libraries', '1')
  url.searchParams.set('saveAndExit', '1')
  url.searchParams.set('noSaveBtn', '0')
  return url.toString()
}

/**
 * Decode a `data:image/svg+xml;base64,...` data URI to the raw SVG string.
 *
 * Returns null on any malformed input:
 *   - not a data URI
 *   - not image/svg+xml
 *   - not base64 encoded
 *   - base64 decode failure
 */
export function parseDrawioExport(dataUri: string): string | null {
  if (!dataUri || typeof dataUri !== 'string') return null
  const prefix = 'data:image/svg+xml;base64,'
  if (!dataUri.startsWith(prefix)) return null
  const b64 = dataUri.slice(prefix.length)
  if (!b64) return null
  try {
    return atob(b64)
  } catch {
    return null
  }
}
