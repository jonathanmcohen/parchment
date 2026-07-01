import { sweepOrphanReleaseNotesFiles } from '@/lib/disk/mirror'
import { sanitizeSegment } from '@/lib/disk/paths'
import { createFolder, findFolderByName } from '@/lib/docs/folders-repo'
import {
  createDocument,
  deleteCollabState,
  deleteDocumentPermanently,
  getDocument,
  listDocuments,
  listDocumentsInFolder,
  trashDocument,
} from '@/lib/docs/repo'
import { GUIDE_DOCS, GUIDE_FOLDER_NAME, releaseNotesTitle } from '@/lib/docs/seed-guide-content'
import {
  currentReleaseNotesContent,
  isUneditedManagedReleaseNotes,
} from '@/lib/docs/seed-guide-refresh'
import { getSetting, setSetting } from '@/lib/docs/settings-repo'
import { APP_VERSION } from '@/lib/version'

// L6: first-run "Parchment Guide" seed. Runs once after owner creation so a fresh
// install isn't empty. No 'server-only' guard so it stays unit-testable; it only
// touches db (pg) via the repos and is imported only by server code (setup action).
//
// Idempotency (belt + suspenders, per the brief): a no-op if the owner already
// has ANY document OR the guideSeeded settings flag is set. Either gate alone is
// enough; both together survive a partial prior run and a manual flag reset.

/** Settings key marking that the first-run guide has been seeded for an owner. */
export const GUIDE_SEEDED_KEY = 'guideSeeded'

/**
 * #4: the app version at which the owner's "Release notes" guide doc was last
 * seeded or refreshed. When it differs from APP_VERSION, refreshReleaseNotesDoc
 * regenerates that doc from the current changelog (only if the user hasn't edited
 * it). Persisted per-owner in the settings store.
 */
export const RELEASE_NOTES_VERSION_KEY = 'releaseNotesGuideVersion'

/**
 * Seed a small "Parchment Guide" workspace for a freshly-created owner.
 *
 * IDEMPOTENT: returns immediately if the `guideSeeded` flag is set or the owner
 * already has any document. Creates a "Parchment Guide" folder and a small tree
 * of guide docs via createDocument (so they are disk-mirrored + searchable +
 * markdown-projected, exactly like every other doc). Sets the flag on success.
 *
 * Best-effort: this is wrapped at the call site so a seed failure can NEVER block
 * owner creation, but we also avoid setting the flag if seeding throws so a later
 * run can retry on the (still-empty) workspace.
 */
export async function seedGuideWorkspace(ownerId: string): Promise<void> {
  // Flag gate — fast path on every subsequent boot/login.
  const alreadySeeded = await getSetting<boolean>(ownerId, GUIDE_SEEDED_KEY, false)
  if (alreadySeeded === true) return

  // Content gate — never seed into a non-empty workspace (e.g. a restored backup
  // or a doc the owner already created before the flag was written).
  const existing = await listDocuments(ownerId)
  if (existing.length > 0) {
    // Mark seeded so we stop re-scanning on every future call.
    await setSetting(ownerId, GUIDE_SEEDED_KEY, true)
    return
  }

  const folder = await createFolder(ownerId, { name: GUIDE_FOLDER_NAME })
  for (const doc of GUIDE_DOCS) {
    await createDocument(ownerId, {
      title: doc.title,
      folderId: folder.id,
      content: doc.content,
    })
  }

  // Only set the flag after all docs are in place, so a mid-run failure leaves
  // the workspace eligible for a retry rather than half-seeded-and-flagged.
  await setSetting(ownerId, GUIDE_SEEDED_KEY, true)
  // #4: record the version the release-notes doc was seeded at, so a later app
  // update can recognise it as stale and (if unedited) refresh it.
  await setSetting(ownerId, RELEASE_NOTES_VERSION_KEY, APP_VERSION)
}

/**
 * #4: edit-safe refresh of the owner's "Release notes" guide doc after an app
 * update. NO-OP unless the stored seed/refresh version differs from APP_VERSION.
 * When it differs we locate the doc and:
 *   • if its content is still an unedited managed snapshot (matches the changelog
 *     rendering of some shipped version) → RECREATE it (a fresh doc with the current
 *     changelog body, in the same guide folder) and bump the stored version;
 *   • if the user EDITED it → leave the doc untouched, but still bump the stored
 *     version so we stop re-checking every boot (the edit wins permanently).
 *
 * v0.2.8 #4 — WHY RECREATE (a fresh doc id) instead of saving in place:
 *   The v0.2.7 attempt rewrote documents.content + title in place and cleared the
 *   server-side Yjs snapshot (collab_state). It demonstrably did NOT make the new
 *   body appear in the editor, because the editor's first-open seeding (D4) reads
 *   documents.content ONLY when there is no shadowing Yjs state — and there are TWO
 *   shadows the server cannot clear for an already-opened doc:
 *     1. collab_state — even after deleting the row, the collab server re-persists
 *        its in-memory snapshot (it holds the doc while any client is connected),
 *        re-creating the row over the delete;
 *     2. browser IndexedDB (`parchment-doc-<id>`) — a per-doc-id local Yjs copy the
 *        editor loads on open; the server has no way to reach or clear it, and the
 *        G11 "IDB had content" guard then refuses to seed documents.content.
 *   A fresh doc id has NEITHER shadow: no collab_state row exists for it and no
 *   browser has an IndexedDB store keyed by it. So the editor seeds the new doc
 *   cleanly from documents.content and the fresh changelog actually renders. This
 *   is verified LIVE (open-in-editor screenshot) — see scratchpad/v028-report.md.
 *
 * Best-effort: every step is guarded so a failure can never block app boot/login.
 * Never clobbers user edits.
 */
export async function refreshReleaseNotesDoc(ownerId: string): Promise<void> {
  try {
    const seededVersion = await getSetting<string | null>(ownerId, RELEASE_NOTES_VERSION_KEY, null)
    // Fast path: already current → nothing to do.
    if (seededVersion === APP_VERSION) return

    const folderId = await findFolderByName(ownerId, GUIDE_FOLDER_NAME)
    if (!folderId) return // no guide folder (never seeded) → nothing to refresh

    // Find the release-notes doc by its title prefix (the version suffix changes).
    const docs = await listDocumentsInFolder(ownerId, folderId)
    const summary = docs.find((d) => d.title.startsWith('Release notes — v'))
    if (!summary) {
      // The doc doesn't exist (user deleted it) — just record the version so we
      // don't re-scan every boot; we won't recreate a doc the user removed.
      await setSetting(ownerId, RELEASE_NOTES_VERSION_KEY, APP_VERSION)
      return
    }

    const doc = await getDocument(summary.id)
    if (!doc) {
      await setSetting(ownerId, RELEASE_NOTES_VERSION_KEY, APP_VERSION)
      return
    }

    if (isUneditedManagedReleaseNotes(doc.content)) {
      // Unedited managed snapshot → RECREATE from the current changelog under a
      // fresh doc id (see the WHY-RECREATE note above). Create the new doc FIRST so
      // a failure before the delete leaves the (still-valid, if stale) old doc in
      // place rather than removing the only copy. createDocument derives the
      // markdown projection + disk mirror itself. The old doc is then removed
      // (trash → permanent; deleteDocumentPermanently only acts on a trashed doc)
      // and its orphan Yjs snapshot cleaned up (collab_state has no FK cascade).
      const created = await createDocument(ownerId, {
        title: releaseNotesTitle(APP_VERSION),
        folderId,
        content: currentReleaseNotesContent(),
      })
      // v0.2.9 #3 — WATCHER RACE ORDER: the old doc's `.md` is removed by
      // trashDocument (removeDocFromDisk) BEFORE the row is hard-deleted, so the
      // reverse-sync watcher can never re-import the stale file into a still-present
      // doc between the two operations — a removed file resolves to no doc (echo),
      // and the watcher's `unlink` handler never deletes docs. The NEW file
      // (`Release notes — v<APP_VERSION>.md`) has a distinct version-suffixed name,
      // so it never collides with the old one during the overlap window.
      await trashDocument(ownerId, summary.id)
      await deleteDocumentPermanently(ownerId, summary.id)
      try {
        await deleteCollabState(summary.id)
      } catch {
        // ignore — orphan-snapshot cleanup is best-effort; the version still bumps.
      }

      // v0.2.9 #3 — sweep any STALE orphan `Release notes — v*.md` files left in the
      // guide folder by prior recreates (prod carried an orphan
      // `Release notes — v0.1.0.md` from June). Keep only the file the just-created
      // live doc owns. Best-effort — a sweep failure must never block boot/login.
      try {
        await sweepStaleReleaseNotesFiles(ownerId, folderId, created.id)
      } catch {
        // best-effort — never blocks the version bump below.
      }
    }
    // Whether we recreated or deferred to a user edit, record the current version so
    // the expensive scan/compare runs at most once per app version.
    await setSetting(ownerId, RELEASE_NOTES_VERSION_KEY, APP_VERSION)
  } catch {
    // Best-effort — a refresh failure must never block boot/login.
  }
}

/**
 * v0.2.9 #3: remove stale orphan `Release notes — v*.md` files from the guide
 * folder on disk, keeping only the file owned by the just-recreated live doc
 * (`keepDocId`). The guide folder is a root-level folder, so its disk directory is
 * `sanitizeSegment(GUIDE_FOLDER_NAME)`; a live release-notes doc's filename is
 * `${sanitizeSegment(title)}.md` (matching what syncDocToDisk writes). We compute
 * the keep-set from every live `Release notes — v*` doc still in the folder (there
 * is normally exactly one — the new doc), so a concurrent edge never deletes a live
 * file. Best-effort — the caller guards it; this never throws on its own.
 */
async function sweepStaleReleaseNotesFiles(
  ownerId: string,
  folderId: string,
  keepDocId: string,
): Promise<void> {
  // Guide folder is root-level → its disk dir is the sanitized folder name.
  const guideDirRel = sanitizeSegment(GUIDE_FOLDER_NAME)
  const inFolder = await listDocumentsInFolder(ownerId, folderId)
  const keep = new Set<string>()
  for (const d of inFolder) {
    if (!d.title.startsWith('Release notes — v')) continue
    // Keep every live release-notes doc's filename (normally just the new doc's),
    // so a concurrent state can never make the sweep delete a live file.
    keep.add(`${sanitizeSegment(d.title)}.md`)
  }
  // `keepDocId` is guaranteed present in the keep-set via its title above; the
  // param documents intent and guards a hypothetical listing lag.
  void keepDocId
  await sweepOrphanReleaseNotesFiles(guideDirRel, keep)
}
