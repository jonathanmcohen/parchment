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

/**
 * v0.2.7 #2: normalise the ProseMirror artifacts the Tiptap editor adds merely by
 * OPENING the doc — so an opened-but-UNEDITED managed doc still hash-matches the
 * pristine managed rendering. Without this, the first time a user opens the guide
 * doc (which is the whole point — it is read), the editor rewrites its content
 * (default `textAlign`/`firstLineIndent` = null on every node, an auto-generated
 * heading `id`, and a trailing empty paragraph), the exact-match check then treats
 * it as "user-edited", and it NEVER refreshes again — the reported bug. This strips
 * exactly those editor-added artifacts and nothing a real edit would add:
 *   • attrs whose value is `null` (the schema's absent-attr defaults),
 *   • a heading's auto-generated `id`,
 *   • trailing EMPTY paragraphs (the editor's mandatory trailing node).
 * A genuine edit (added text, a real extra block) survives normalisation and is
 * still correctly rejected.
 */
function normalizeManagedContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    const arr = value.map(normalizeManagedContent)
    // Drop trailing empty paragraphs (editor's mandatory trailing node).
    while (arr.length > 0 && isEmptyParagraph(arr[arr.length - 1])) arr.pop()
    return arr
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'attrs' && val !== null && typeof val === 'object' && !Array.isArray(val)) {
        const attrs: Record<string, unknown> = {}
        for (const [ak, av] of Object.entries(val as Record<string, unknown>)) {
          if (av === null) continue // editor-added absent-attr default (textAlign, firstLineIndent, …)
          if (ak === 'id') continue // editor-generated heading anchor id
          attrs[ak] = av
        }
        // Only keep a non-empty attrs object (an all-defaults attrs collapses away,
        // matching the pristine rendering that omits `attrs` entirely).
        if (Object.keys(attrs).length > 0) out.attrs = attrs
      } else {
        out[key] = normalizeManagedContent(val)
      }
    }
    return out
  }
  return value
}

/** A paragraph node with no (or empty) content — the editor's trailing node. */
function isEmptyParagraph(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false
  const n = node as { type?: unknown; content?: unknown }
  if (n.type !== 'paragraph') return false
  return n.content === undefined || (Array.isArray(n.content) && n.content.length === 0)
}

/**
 * Stable, key-order-independent hash of a ProseMirror doc (content only), AFTER
 * normalising editor-added artifacts (v0.2.7 #2) so an opened-but-unedited doc
 * hashes identically to the pristine managed rendering.
 */
export function stableContentHash(content: unknown): string {
  return JSON.stringify(canonicalize(normalizeManagedContent(content)))
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
