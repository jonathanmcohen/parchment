// v0.2.7 #4b: server-side fetch + disk cache for picked Google fonts.
//
// The ONLY place Parchment ever contacts Google. Given an allow-listed family, it
// returns the woff2 bytes — from the local disk cache if present, otherwise fetched
// ONCE from Google (CSS2 API → first gstatic woff2 → download), cached, and
// returned. The client only ever sees the local `/api/fonts/google/<slug>.woff2`
// URL, so the browser never loads from Google (the privacy guarantee).
//
// Server-only-ish (node:fs + fetch). No 'server-only' guard so it stays
// integration-testable; it is imported only by the nodejs-runtime font route.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { absPath } from '@/lib/disk/mirror'
import { isAllowedGoogleFont } from '@/lib/fonts/google-catalog'
import { firstWoff2Url, fontSlug, googleCssApiUrl, isGstaticWoff2 } from '@/lib/fonts/google-fonts'

// A modern UA so Google's CSS2 API returns woff2 (it content-negotiates on UA).
const WOFF2_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Cached under a DOT-dir so the disk reverse-sync watcher ignores it (it skips any
// path with a dot-segment — see relPathIfManaged), keeping font bytes out of the
// user's mirrored files tree.
function cacheRelPath(family: string): string {
  return `.fonts-cache/google/${fontSlug(family)}.woff2`
}

/** Read cached woff2 bytes for a family, or null if not yet cached. Never throws. */
async function readCached(family: string): Promise<Uint8Array | null> {
  try {
    const buf = await readFile(absPath(cacheRelPath(family)))
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

/** Write woff2 bytes to the cache (mkdir -p first). */
async function writeCached(family: string, bytes: Uint8Array): Promise<void> {
  const abs = absPath(cacheRelPath(family))
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, Buffer.from(bytes))
}

/**
 * Return the woff2 bytes for an allow-listed Google `family`, fetching + caching on
 * a miss. Returns null when the family is not allow-listed (the SSRF gate) or the
 * upstream fetch fails. The two outbound requests (CSS2 API, then the gstatic
 * woff2) are both validated: the family must be in the catalogue, and the download
 * URL must be a fonts.gstatic.com woff2 taken from Google's own CSS response.
 *
 * `fetchImpl` is injectable for tests (defaults to global fetch).
 */
export async function getGoogleFontWoff2(
  family: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  // SSRF GATE: only ever act on an exact catalogue family.
  if (!isAllowedGoogleFont(family)) return null

  const cached = await readCached(family)
  if (cached) return cached

  try {
    // 1) Ask Google's CSS2 API for the @font-face CSS (woff2 via the UA).
    const cssRes = await fetchImpl(googleCssApiUrl(family), {
      headers: { 'User-Agent': WOFF2_UA },
    })
    if (!cssRes.ok) return null
    const css = await cssRes.text()

    // 2) Pull the first gstatic woff2 URL from Google's OWN response (not user
    //    input) and re-validate the host/extension before downloading.
    const woff2Url = firstWoff2Url(css)
    if (!woff2Url || !isGstaticWoff2(woff2Url)) return null

    const fontRes = await fetchImpl(woff2Url)
    if (!fontRes.ok) return null
    const bytes = new Uint8Array(await fontRes.arrayBuffer())
    if (bytes.byteLength === 0) return null

    // 3) Cache for next time (best-effort — a cache write failure still serves the
    //    bytes this request).
    try {
      await writeCached(family, bytes)
    } catch {
      // ignore — caching is best-effort.
    }
    return bytes
  } catch {
    return null
  }
}
