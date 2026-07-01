import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.2 #4 / v0.2.8 #4: orchestration of the edit-safe release-notes refresh. All
// db repos + settings are mocked; we assert the decision branches:
//   - version unchanged → no-op (no doc lookup, no recreate)
//   - version changed + unedited managed doc → RECREATE (fresh doc id) + bump
//   - version changed + user-edited doc → NO recreate, but version is still bumped
//
// v0.2.8 #4 — why RECREATE instead of the v0.2.7 save-in-place + deleteCollabState:
// rewriting documents.content is invisible in the editor once EITHER a server-side
// Yjs snapshot (collab_state) OR a browser-local IndexedDB copy of the doc exists —
// both shadow documents.content via the D4 first-open seeding gate, and the server
// can clear neither reliably (the collab server re-persists its in-memory snapshot,
// and browser IndexedDB is unreachable from the server). A fresh doc id has NO
// collab_state and NO IndexedDB store, so the editor cleanly seeds it from the
// freshly-written documents.content. Verified live (screenshot) — see v028-report.md.

const {
  getSetting,
  setSetting,
  findFolderByName,
  listDocumentsInFolder,
  getDocument,
  createDocument,
  trashDocument,
  deleteDocumentPermanently,
  deleteCollabState,
} = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<unknown>>(),
  setSetting: vi.fn<() => Promise<void>>(),
  findFolderByName: vi.fn<() => Promise<string | null>>(),
  listDocumentsInFolder: vi.fn<() => Promise<Array<{ id: string; title: string }>>>(),
  getDocument: vi.fn<() => Promise<unknown>>(),
  createDocument:
    vi.fn<
      (
        ownerId: string,
        opts: { title?: string; folderId?: string; content?: unknown },
      ) => Promise<{ id: string }>
    >(),
  trashDocument: vi.fn<(ownerId: string, id: string) => Promise<void>>(),
  deleteDocumentPermanently: vi.fn<(ownerId: string, id: string) => Promise<boolean>>(),
  deleteCollabState: vi.fn<(id: string) => Promise<number>>(),
}))

vi.mock('@/lib/docs/settings-repo', () => ({ getSetting, setSetting }))
vi.mock('@/lib/docs/folders-repo', () => ({ findFolderByName, createFolder: vi.fn() }))
vi.mock('@/lib/docs/repo', () => ({
  listDocumentsInFolder,
  getDocument,
  createDocument,
  trashDocument,
  deleteDocumentPermanently,
  deleteCollabState,
  saveDocument: vi.fn(),
  listDocuments: vi.fn(),
}))
vi.mock('@/lib/markdown/serialize', () => ({ serializeMarkdown: () => '# Release notes' }))

import { refreshReleaseNotesDoc } from '@/lib/docs/seed-guide'
import { currentReleaseNotesContent } from '@/lib/docs/seed-guide-refresh'
import { APP_VERSION } from '@/lib/version'

beforeEach(() => {
  vi.clearAllMocks()
  createDocument.mockResolvedValue({ id: 'new-doc' })
  deleteDocumentPermanently.mockResolvedValue(true)
})

describe('refreshReleaseNotesDoc', () => {
  it('is a no-op when the stored version already matches APP_VERSION', async () => {
    getSetting.mockResolvedValue(APP_VERSION)
    await refreshReleaseNotesDoc('owner1')
    expect(findFolderByName).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('RECREATES the doc (fresh id) when version changed and the doc is an unedited managed snapshot', async () => {
    getSetting.mockResolvedValue('0.1.0') // an older version → stale
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([{ id: 'doc1', title: 'Release notes — v0.1.0' }])
    // The doc still holds the CURRENT managed rendering (unedited).
    getDocument.mockResolvedValue({ id: 'doc1', content: currentReleaseNotesContent() })

    await refreshReleaseNotesDoc('owner1')

    // v0.2.8 #4: a fresh doc is created with the current changelog body + title, in
    // the same guide folder. A fresh id has no collab_state / IndexedDB shadow, so
    // the editor seeds it cleanly from documents.content — the content actually
    // surfaces (unlike the v0.2.7 save-in-place approach that got shadowed).
    expect(createDocument).toHaveBeenCalledTimes(1)
    const createCall = createDocument.mock.calls[0]
    expect(createCall?.[0]).toBe('owner1')
    expect(createCall?.[1]?.title).toBe(`Release notes — v${APP_VERSION}`)
    expect(createCall?.[1]?.folderId).toBe('folder1')
    // The body is the CURRENT changelog rendering (contains the newest version).
    const created = createCall?.[1]?.content as { content?: unknown[] }
    expect(JSON.stringify(created)).toContain(`v${APP_VERSION}`)

    // The stale old doc is removed (trash → permanent) so the folder is not left
    // with two "Release notes" docs.
    expect(trashDocument).toHaveBeenCalledWith('owner1', 'doc1')
    expect(deleteDocumentPermanently).toHaveBeenCalledWith('owner1', 'doc1')
    // Its orphan Yjs snapshot is cleaned up too (no FK cascade on collab_state).
    expect(deleteCollabState).toHaveBeenCalledWith('doc1')

    // Stored version bumped to current.
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('does NOT touch a user-edited doc, but still bumps the stored version', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([{ id: 'doc1', title: 'Release notes — v0.1.0' }])
    const edited = currentReleaseNotesContent()
    ;(edited.content as unknown[]).push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'user note' }],
    })
    getDocument.mockResolvedValue({ id: 'doc1', content: edited })

    await refreshReleaseNotesDoc('owner1')

    // A user-edited doc is NEVER recreated/deleted — that would destroy the edits.
    expect(createDocument).not.toHaveBeenCalled()
    expect(trashDocument).not.toHaveBeenCalled()
    expect(deleteDocumentPermanently).not.toHaveBeenCalled()
    expect(deleteCollabState).not.toHaveBeenCalled()
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('bumps the version (no recreate) when the guide doc was deleted by the user', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([]) // doc gone
    await refreshReleaseNotesDoc('owner1')
    expect(createDocument).not.toHaveBeenCalled()
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('is a no-op (no throw) when the guide folder does not exist', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue(null)
    await refreshReleaseNotesDoc('owner1')
    expect(createDocument).not.toHaveBeenCalled()
    expect(setSetting).not.toHaveBeenCalled()
  })

  it('swallows a recreate failure (never throws) and leaves the version unbumped to retry', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([{ id: 'doc1', title: 'Release notes — v0.1.0' }])
    getDocument.mockResolvedValue({ id: 'doc1', content: currentReleaseNotesContent() })
    createDocument.mockRejectedValue(new Error('db down'))

    // Best-effort: must not throw out of the refresh (it runs on the owner layout).
    await expect(refreshReleaseNotesDoc('owner1')).resolves.toBeUndefined()

    // createDocument threw BEFORE the old doc was removed → the (stale) old doc is
    // still intact (never trashed/deleted), and the version is NOT bumped, so the
    // next boot retries the recreate rather than silently giving up on a transient
    // failure.
    expect(trashDocument).not.toHaveBeenCalled()
    expect(deleteDocumentPermanently).not.toHaveBeenCalled()
    expect(setSetting).not.toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })
})
