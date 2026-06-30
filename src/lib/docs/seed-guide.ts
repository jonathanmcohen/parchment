import { createFolder, findFolderByName } from '@/lib/docs/folders-repo'
import {
  createDocument,
  getDocument,
  listDocuments,
  listDocumentsInFolder,
  saveDocument,
} from '@/lib/docs/repo'
import { GUIDE_DOCS, GUIDE_FOLDER_NAME, releaseNotesTitle } from '@/lib/docs/seed-guide-content'
import {
  currentReleaseNotesContent,
  isUneditedManagedReleaseNotes,
} from '@/lib/docs/seed-guide-refresh'
import { getSetting, setSetting } from '@/lib/docs/settings-repo'
import { serializeMarkdown } from '@/lib/markdown/serialize'
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
 *     rendering of some shipped version) → regenerate it from the current changelog
 *     and bump the stored version;
 *   • if the user EDITED it → leave the content untouched, but still bump the stored
 *     version so we stop re-checking every boot (the edit wins permanently).
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
      // Unedited managed snapshot → regenerate from the current changelog.
      const content = currentReleaseNotesContent()
      const markdown = serializeMarkdown(content)
      await saveDocument(summary.id, {
        contentJson: content,
        markdown,
        title: releaseNotesTitle(APP_VERSION),
      })
    }
    // Whether we refreshed or deferred to a user edit, record the current version so
    // the expensive scan/compare runs at most once per app version.
    await setSetting(ownerId, RELEASE_NOTES_VERSION_KEY, APP_VERSION)
  } catch {
    // Best-effort — a refresh failure must never block boot/login.
  }
}
