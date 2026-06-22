/**
 * G6b — PlantUML helper (pure, no React/db).
 *
 * PlantUML rendering is enabled ONLY when `NEXT_PUBLIC_PLANTUML_SERVER_URL`
 * is set. Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle, so
 * both the server and client can read this value without an extra API call.
 *
 * When the env var is unset (the default), `plantumlEnabled()` returns false and
 * `plantumlImageUrl` returns null — no external calls are made. This mirrors the
 * E9 semantic-search pattern in `src/lib/search/embeddings.ts`.
 *
 * Usage:
 *   NEXT_PUBLIC_PLANTUML_SERVER_URL=https://www.plantuml.com/plantuml
 */

/**
 * Returns true when a PlantUML server URL has been configured.
 * Both server-side and client-side code may call this safely.
 */
export function plantumlEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_PLANTUML_SERVER_URL
}

/**
 * Build the image URL for a PlantUML source string using the configured server.
 *
 * - Returns `null` when the server URL is not configured (disabled by default).
 * - Returns `null` when `source` is empty/whitespace.
 * - Otherwise returns `{serverBase}/{format}/{encodedSource}`.
 *
 * SECURITY: the source is encoded via `plantuml-encoder` (pure URL-safe base64)
 * before being appended to the URL — user input never lands in the URL raw.
 * The browser fetches the resulting URL as an `<img>` src, never as a script.
 */
export function plantumlImageUrl(source: string, format: 'svg' | 'png' = 'svg'): string | null {
  const base = process.env.NEXT_PUBLIC_PLANTUML_SERVER_URL
  if (!base) return null
  if (!source.trim()) return null

  // plantuml-encoder is a tiny pure-JS lib (no window dep) — safe to import anywhere.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const encoder = require('plantuml-encoder') as { encode: (s: string) => string }
  const token = encoder.encode(source)
  if (!token) return null

  return `${base.replace(/\/$/, '')}/${format}/${token}`
}
