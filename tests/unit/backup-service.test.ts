import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// service.ts uses 'server-only' — mock it so tests don't fail on import.
vi.mock('server-only', () => ({}))

// Mock the repo + folders-repo so restoreWorkspaceBackup is exercised without a DB.
const createDocumentMock = vi.fn()
const listFoldersMock = vi.fn()

vi.mock('@/lib/docs/repo', () => ({
  createDocument: (...args: unknown[]) => createDocumentMock(...args),
  // unused by restore, but imported by the module
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
}))
vi.mock('@/lib/docs/folders-repo', () => ({
  listFolders: (...args: unknown[]) => listFoldersMock(...args),
}))

import { buildWorkspaceBackup } from '@/lib/backup/archive'
import { restoreWorkspaceBackup } from '@/lib/backup/service'

const CREATED_AT = '2026-06-22T00:00:00.000Z'

function backupBytes(
  docs: { id: string; title: string; folderId: string | null; content: unknown }[],
): Promise<Uint8Array> {
  return buildWorkspaceBackup(docs, CREATED_AT)
}

describe('I4 — restoreWorkspaceBackup', () => {
  beforeEach(() => {
    createDocumentMock.mockReset()
    listFoldersMock.mockReset()
    listFoldersMock.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates one doc per entry and returns the tally', async () => {
    createDocumentMock.mockResolvedValue({ id: 'new-id' })
    const bytes = await backupBytes([
      { id: 'a', title: 'Alpha', folderId: null, content: { type: 'doc', content: [] } },
      { id: 'b', title: 'Beta', folderId: null, content: { type: 'doc', content: [] } },
    ])

    const result = await restoreWorkspaceBackup('owner-1', bytes)

    expect(result.created).toBe(2)
    expect(result.skipped).toBe(0)
    expect(createDocumentMock).toHaveBeenCalledTimes(2)
    expect(createDocumentMock).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ title: 'Alpha' }),
    )
  })

  it('is resilient: one failing createDocument is skipped (+warning), the rest succeed', async () => {
    createDocumentMock
      .mockResolvedValueOnce({ id: 'ok-1' })
      .mockRejectedValueOnce(new Error('insert blew up'))
      .mockResolvedValueOnce({ id: 'ok-3' })
    const bytes = await backupBytes([
      { id: 'a', title: 'Alpha', folderId: null, content: { type: 'doc', content: [] } },
      { id: 'b', title: 'Beta', folderId: null, content: { type: 'doc', content: [] } },
      { id: 'c', title: 'Gamma', folderId: null, content: { type: 'doc', content: [] } },
    ])

    const result = await restoreWorkspaceBackup('owner-1', bytes)

    expect(result.created).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.warnings.some((w) => /Beta/.test(w) && /insert blew up/.test(w))).toBe(true)
  })

  it('drops a folderId that is not an existing folder of this owner (foreign → null)', async () => {
    createDocumentMock.mockResolvedValue({ id: 'new-id' })
    // Owner has folder "mine"; the backup references "foreign".
    listFoldersMock.mockResolvedValue([{ id: 'mine', name: 'Mine', parentId: null }])
    const bytes = await backupBytes([
      { id: 'a', title: 'Owned', folderId: 'mine', content: { type: 'doc', content: [] } },
      { id: 'b', title: 'Foreign', folderId: 'foreign', content: { type: 'doc', content: [] } },
    ])

    await restoreWorkspaceBackup('owner-1', bytes)

    const calls = createDocumentMock.mock.calls
    const ownedCall = calls.find((c) => (c[1] as { title: string }).title === 'Owned')?.[1] as {
      folderId?: string
    }
    const foreignCall = calls.find((c) => (c[1] as { title: string }).title === 'Foreign')?.[1] as {
      folderId?: string
    }
    // existing folder kept
    expect(ownedCall.folderId).toBe('mine')
    // foreign folder dropped → folderId not passed (undefined)
    expect(foreignCall.folderId).toBeUndefined()
  })

  it('throws on a fundamentally invalid backup (not a zip)', async () => {
    const notZip = new TextEncoder().encode('nope')
    await expect(restoreWorkspaceBackup('owner-1', notZip)).rejects.toThrow()
  })
})
