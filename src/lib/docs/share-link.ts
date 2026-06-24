// F9: pure, CLIENT-SAFE helpers for the share dialog's Restricted ⇄ "Anyone with
// the link" toggle. NO `@/db` import — the dialog is a client component, so this
// module must stay free of server-only / pg deps (it mirrors the share's client
// shape, not the DB row). The DB-backed lifecycle lives in shares-repo.ts.
//
// Link model (G1): a share row's existence == "Anyone with the link" ON; revoke
// deletes the row. An expired share grants no access (the public route 404s), so
// it must NOT count as an active public link here either.

/** The client-safe share shape returned by GET /api/docs/[id]/shares. */
export type ShareLinkRow = {
  id: string
  token: string
  permission: string
  hasPassword: boolean
  expiresAt: string | null
  createdAt: string
  url: string
}

/** CF4: build the public viewer URL for a share token from a FIXED base URL
 *  (server config: `env.publicUrl`), never from the request origin. Behind a
 *  reverse proxy the request origin is the internal bind (`0.0.0.0:3000`), so a
 *  `req`-derived link leaks the wrong host. Pure + framework-free so the route
 *  passes `env.publicUrl` and a unit test can prove the host comes from config. */
export function buildShareUrl(baseUrl: string, token: string): string {
  return new URL(`/share/${token}`, baseUrl).toString()
}

/** True when the share still grants access: no expiry, or an expiry in the
 *  future relative to `now`. Mirrors shares-repo `isExpired`, on the client
 *  string shape. */
export function isShareActive(row: ShareLinkRow, now: Date = new Date()): boolean {
  if (row.expiresAt === null) return true
  const expiry = new Date(row.expiresAt)
  if (Number.isNaN(expiry.getTime())) return false
  return expiry.getTime() >= now.getTime()
}

/** The share that backs the live "Anyone with the link" state: the newest active
 *  (non-expired) share, or null when none is active (== Restricted). Reused on
 *  dialog open so a re-open never creates a duplicate link. */
export function pickActiveShare(
  rows: readonly ShareLinkRow[],
  now: Date = new Date(),
): ShareLinkRow | null {
  let best: ShareLinkRow | null = null
  for (const row of rows) {
    if (!isShareActive(row, now)) continue
    if (best === null || row.createdAt > best.createdAt) best = row
  }
  return best
}
