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
 * v0.2.9 #1 — COMPARE NORMALIZED MARKDOWN PROJECTIONS, not ProseMirror-JSON hashes.
 *
 *   The v0.2.7/v0.2.8 approach hashed the ProseMirror JSON (after stripping a few
 *   editor artifacts). ProseMirror JSON is NOT round-trip-stable across the
 *   disk-mirror: the reverse-sync watcher re-imports the doc's `.md` via
 *   markdownToJson at container boot (BEFORE this refresh runs), which rewrites the
 *   JSON — trailing spaces on headings, dropped null attrs, and (pre-v0.2.9) an
 *   ever-growing pile of `<!-- id:… -->` heading comments. The round-tripped JSON
 *   then hashed to NOTHING in the managed set, the doc was misclassified as
 *   "edited", the recreate was skipped, and the version bumped anyway → permanently
 *   stuck. This was the THIRD shadow that defeated v0.2.8 in production (the
 *   disk-mirror .md + watcher, alongside collab_state and browser IndexedDB).
 *
 *   Markdown IS the canonical disk format, so every Yjs / IndexedDB / disk round
 *   trip is markdown-stable BY DESIGN — that is the whole disk-mirror product
 *   guarantee. So we project the candidate content to markdown with the SAME
 *   serializer the mirror uses, normalise away the cosmetic-but-lossy differences a
 *   round trip introduces (heading-id comments, trailing whitespace, blank-line
 *   runs), and compare that against the normalised markdown of every changelog
 *   suffix. A genuine user edit changes the markdown (added/removed/changed text or
 *   blocks) and still classifies as edited.
 *
 * Pure (no db / React) so it is unit-testable; the orchestration that reads/writes
 * the doc lives in seed-guide.ts.
 */

import { CHANGELOG } from '@/lib/help/content'
import { serializeMarkdown } from '@/lib/markdown/serialize'
import { releaseNotesDocFromChangelog } from './seed-guide-content'

/**
 * v0.2.9 #1: strip EVERY heading-id sentinel comment from serialized markdown.
 * serialize.ts appends ` <!-- id:<slug> -->` to headings so their anchor id
 * survives the disk cycle; the slug is regenerated per editor open and differs
 * across round trips (and, pre-v0.2.9, snowballed). It carries no user intent, so
 * it must be invisible to edit-detection. Content-agnostic (`[^>]*?`) so it strips
 * any id string the editor/serializer ever produced, including the polluted
 * snowballed ids observed in prod (`id:release-notes-idrelease-notes-…`).
 */
const ID_COMMENT_RE = /<!--\s*id:[^>]*?-->/g

/**
 * v0.2.9 #1: normalise a serialized-markdown string to a canonical form that is
 * stable across disk-mirror round trips but still reflects real content edits.
 *   1. strip all heading-id sentinel comments,
 *   2. trim trailing whitespace on every line (a round trip can add a trailing
 *      space where an id comment used to sit, e.g. `# Release notes `),
 *   3. collapse 3+ consecutive newlines to a single blank line,
 *   4. drop trailing newlines.
 * These are exactly the cosmetic deltas a serialize→disk→parse→serialize cycle can
 * introduce; none of them corresponds to a user edit.
 */
function normalizeMarkdown(md: string): string {
  return md
    .replace(ID_COMMENT_RE, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '')
}

/**
 * v0.2.9 #1: the normalized markdown projection of a ProseMirror release-notes
 * doc. Exported for tests + reuse. Serializes with the disk-mirror serializer, then
 * applies the round-trip-stable normalisation above.
 */
export function normalizedReleaseNotesMarkdown(content: unknown): string {
  return normalizeMarkdown(serializeMarkdown(content))
}

/**
 * Every normalized markdown projection the unedited managed release-notes doc could
 * hold — one per changelog suffix (i.e. per app version that has shipped). Used to
 * recognise an unedited managed doc no matter which version last seeded/refreshed
 * it, and independent of any disk-mirror round-trip cosmetics.
 */
export function managedReleaseNotesMarkdown(): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < CHANGELOG.length; i++) {
    set.add(normalizedReleaseNotesMarkdown(releaseNotesDocFromChangelog(CHANGELOG.slice(i))))
  }
  return set
}

/**
 * True when `currentContent`'s normalized markdown equals one of the managed
 * (unedited) renderings — i.e. the doc is still the seeded/refreshed snapshot (even
 * after disk-mirror / editor round trips) and may be safely regenerated. False means
 * the user edited it; the caller MUST NOT overwrite it.
 */
export function isUneditedManagedReleaseNotes(currentContent: unknown): boolean {
  return managedReleaseNotesMarkdown().has(normalizedReleaseNotesMarkdown(currentContent))
}

/** The current (newest) release-notes body the refresh writes. */
export function currentReleaseNotesContent() {
  return releaseNotesDocFromChangelog(CHANGELOG)
}
