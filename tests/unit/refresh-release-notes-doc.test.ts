import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.2 #4: orchestration of the edit-safe release-notes refresh. All db repos +
// settings are mocked; we assert the decision branches:
//   - version unchanged → no-op (no doc lookup, no save)
//   - version changed + unedited managed doc → saveDocument with fresh content + bump
//   - version changed + user-edited doc → NO save, but version is still bumped

const {
  getSetting,
  setSetting,
  findFolderByName,
  listDocumentsInFolder,
  getDocument,
  saveDocument,
} = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<unknown>>(),
  setSetting: vi.fn<() => Promise<void>>(),
  findFolderByName: vi.fn<() => Promise<string | null>>(),
  listDocumentsInFolder: vi.fn<() => Promise<Array<{ id: string; title: string }>>>(),
  getDocument: vi.fn<() => Promise<unknown>>(),
  saveDocument: vi.fn<(id: string, data: { title?: string }) => Promise<void>>(),
}))

vi.mock('@/lib/docs/settings-repo', () => ({ getSetting, setSetting }))
vi.mock('@/lib/docs/folders-repo', () => ({ findFolderByName, createFolder: vi.fn() }))
vi.mock('@/lib/docs/repo', () => ({
  listDocumentsInFolder,
  getDocument,
  saveDocument,
  createDocument: vi.fn(),
  listDocuments: vi.fn(),
}))
vi.mock('@/lib/markdown/serialize', () => ({ serializeMarkdown: () => '# Release notes' }))

import { refreshReleaseNotesDoc } from '@/lib/docs/seed-guide'
import { currentReleaseNotesContent } from '@/lib/docs/seed-guide-refresh'
import { APP_VERSION } from '@/lib/version'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('refreshReleaseNotesDoc', () => {
  it('is a no-op when the stored version already matches APP_VERSION', async () => {
    getSetting.mockResolvedValue(APP_VERSION)
    await refreshReleaseNotesDoc('owner1')
    expect(findFolderByName).not.toHaveBeenCalled()
    expect(saveDocument).not.toHaveBeenCalled()
  })

  it('regenerates the doc when version changed and the doc is an unedited managed snapshot', async () => {
    getSetting.mockResolvedValue('0.1.0') // an older version → stale
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([{ id: 'doc1', title: 'Release notes — v0.1.0' }])
    // The doc still holds the CURRENT managed rendering (unedited).
    getDocument.mockResolvedValue({ id: 'doc1', content: currentReleaseNotesContent() })

    await refreshReleaseNotesDoc('owner1')

    expect(saveDocument).toHaveBeenCalledTimes(1)
    const call = saveDocument.mock.calls[0]
    expect(call?.[0]).toBe('doc1')
    expect(call?.[1]?.title).toBe(`Release notes — v${APP_VERSION}`)
    // Stored version bumped to current.
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('does NOT overwrite a user-edited doc, but still bumps the stored version', async () => {
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

    expect(saveDocument).not.toHaveBeenCalled()
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('bumps the version (no save) when the guide doc was deleted by the user', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue('folder1')
    listDocumentsInFolder.mockResolvedValue([]) // doc gone
    await refreshReleaseNotesDoc('owner1')
    expect(saveDocument).not.toHaveBeenCalled()
    expect(setSetting).toHaveBeenCalledWith('owner1', 'releaseNotesGuideVersion', APP_VERSION)
  })

  it('is a no-op (no throw) when the guide folder does not exist', async () => {
    getSetting.mockResolvedValue('0.1.0')
    findFolderByName.mockResolvedValue(null)
    await refreshReleaseNotesDoc('owner1')
    expect(saveDocument).not.toHaveBeenCalled()
    expect(setSetting).not.toHaveBeenCalled()
  })
})
