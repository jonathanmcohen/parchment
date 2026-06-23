import { createFolder } from '@/lib/docs/folders-repo'
import { createDocument, listDocuments } from '@/lib/docs/repo'
import { GUIDE_DOCS, GUIDE_FOLDER_NAME } from '@/lib/docs/seed-guide-content'
import { getSetting, setSetting } from '@/lib/docs/settings-repo'

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
}
