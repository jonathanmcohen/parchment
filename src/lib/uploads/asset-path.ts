// J1-2: pure asset path resolver. NO fs, NO db. Unit-testable in isolation.
//
// Decision ADR J1-0(a): assets are identity-keyed at `.assets/<docId>/<uuid>.<ext>`
// under the files root. The stored filename is ALWAYS a freshly minted uuid + a
// sanitized extension — the user's original filename is never echoed into the path
// (defeats traversal, header-injection, and information leak). The doc id is a uuid
// from the DB but we still validate it as a path-safe segment so a malformed/hostile
// id can never produce an escaping path.

import { randomUUID } from 'node:crypto'

export const ASSETS_DIRNAME = '.assets'

// A stored asset name is exactly: 36-char lowercase uuid + '.' + 1..8 lowercase alnum.
const SAFE_ASSET_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/
// A doc id must be a bare uuid (the DB shape) — used as a single path segment.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Normalize a user/sniffed extension into safe lowercase alnum (≤8), else 'bin'. */
function safeExt(ext: string): string {
  const cleaned = ext
    .toLowerCase()
    .replace(/^\.+/, '') // strip leading dots
    .replace(/[^a-z0-9]/g, '') // drop everything non-alnum (kills /, .., null, etc.)
    .slice(0, 8)
  return cleaned.length > 0 ? cleaned : 'bin'
}

/**
 * Mint a storage filename: `<uuid>.<safeExt>`. The `_original` argument is accepted
 * only so callers can pass the source name for logging — it is INTENTIONALLY ignored
 * for the path (never echoed). Pass the sniffed/validated extension as `ext`.
 */
export function safeAssetName(_original: string, ext: string): string {
  return `${randomUUID()}.${safeExt(ext)}`
}

/** True iff `name` is a path-safe `<uuid>.<ext>` with no separators/dots/traversal. */
export function isUuidName(name: string): boolean {
  return SAFE_ASSET_NAME.test(name)
}

/**
 * Relative path (under the files root) for a doc's asset. THROWS if the doc id is not
 * a bare uuid or the filename is not a minted safe name — callers must pass a name
 * produced by safeAssetName (upload) or a request param already shape-checked
 * (download). The result is always `.assets/<docId>/<name>` with no '..' segment.
 */
export function assetRelPath(doc: { id: string }, filename: string): string {
  if (!UUID.test(doc.id)) throw new Error('assetRelPath: invalid doc id')
  if (!isUuidName(filename)) throw new Error('assetRelPath: unsafe asset filename')
  return `${ASSETS_DIRNAME}/${doc.id}/${filename}`
}

/** The relative directory holding all of a doc's assets (for cleanup on delete). */
export function assetDirRelPath(doc: { id: string }): string {
  if (!UUID.test(doc.id)) throw new Error('assetDirRelPath: invalid doc id')
  return `${ASSETS_DIRNAME}/${doc.id}`
}
