/**
 * v0.2.2 #4 — edit-safe refresh of the "Release notes" guide doc.
 *
 * seedGuideWorkspace seeds the guide ONCE at owner creation, so the in-folder
 * "Release notes" doc is a frozen snapshot of the changelog at install time. After
 * an app update it goes stale (Help / About already render the live changelog, but
 * the doc does not). This module regenerates ONLY that doc from the current
 * changelog when the app version changed — and ONLY when the user has not edited it.
 *
 * Edit-safety: the changelog grows by PREPENDING newest-first, so the body the app
 * produced at version V is exactly releaseNotesDocFromChangelog(CHANGELOG.slice(idx
 * of V)). We therefore know every body the unedited managed doc could legitimately
 * hold across versions — the set of changelog-suffix renderings. If the doc's
 * current content matches ANY of those, it is the unedited managed snapshot and is
 * safe to refresh. If it matches none, the user edited it → leave it untouched.
 *
 * Pure (no db / React) so it is unit-testable; the orchestration that reads/writes
 * the doc lives in seed-guide.ts.
 */

import { CHANGELOG } from '@/lib/help/content'
import { releaseNotesDocFromChangelog } from './seed-guide-content'

/** Stable, key-order-independent hash of a ProseMirror doc (content only). */
export function stableContentHash(content: unknown): string {
  return JSON.stringify(canonicalize(content))
}

// Recursively sort object keys so semantically-equal docs hash identically
// regardless of key insertion order (createDocument/saveDocument may reorder).
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key])
    return out
  }
  return value
}

/**
 * Every content hash the unedited managed release-notes doc could hold — one per
 * changelog suffix (i.e. per app version that has shipped). Used to recognise an
 * unedited managed doc no matter which version last seeded/refreshed it.
 */
export function managedReleaseNotesHashes(): Set<string> {
  const hashes = new Set<string>()
  for (let i = 0; i < CHANGELOG.length; i++) {
    hashes.add(stableContentHash(releaseNotesDocFromChangelog(CHANGELOG.slice(i))))
  }
  return hashes
}

/**
 * True when `currentContent` equals one of the managed (unedited) renderings — i.e.
 * the doc is still the seeded/refreshed snapshot and may be safely regenerated.
 * False means the user edited it; the caller MUST NOT overwrite it.
 */
export function isUneditedManagedReleaseNotes(currentContent: unknown): boolean {
  return managedReleaseNotesHashes().has(stableContentHash(currentContent))
}

/** The current (newest) release-notes body the refresh writes. */
export function currentReleaseNotesContent() {
  return releaseNotesDocFromChangelog(CHANGELOG)
}
