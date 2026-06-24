// F6: pure logic for the 404 recovery search. Kept framework-free (no React, no
// DOM, no @/db) so it unit-tests cleanly and stays off any server path. The
// not-found client component imports these to drive the debounced input.

/** A single result row as returned by GET /api/search (subset we render). */
export interface RecoveryResult {
  id: string
  title: string
  preview: string
}

/** Shape of the JSON body GET /api/search returns on success. */
export interface RecoverySearchBody {
  results?: RecoveryResult[]
}

/**
 * Outcome of interpreting a search fetch:
 *  - 'unauthenticated': the route returned 401 — caller must hide the box / show
 *    a sign-in hint, NEVER a dead box that keeps 401-ing.
 *  - 'ok': authenticated; `results` holds the (possibly empty) matches.
 *  - 'error': any other failure — caller keeps the box but renders no results.
 */
export type RecoverySearchState =
  | { status: 'unauthenticated' }
  | { status: 'ok'; results: RecoveryResult[] }
  | { status: 'error' }

/** Build the authenticated search URL. Empty/whitespace query → null (no request). */
export function buildRecoverySearchUrl(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  return `/api/search?q=${encodeURIComponent(trimmed)}`
}

/**
 * Map an HTTP status + parsed body into a recovery state. 401 is the auth gate
 * (per the brief: hide/hint, never a dead box). A 2xx with a results array is
 * 'ok'; anything else is 'error'.
 */
export function interpretRecoveryResponse(
  status: number,
  body: RecoverySearchBody | null,
): RecoverySearchState {
  if (status === 401) return { status: 'unauthenticated' }
  if (status >= 200 && status < 300) {
    return { status: 'ok', results: body?.results ?? [] }
  }
  return { status: 'error' }
}

/** Build the link target for a recovery result (per the brief: /d/<id>). */
export function recoveryResultHref(id: string): string {
  return `/d/${id}`
}
