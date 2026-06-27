import { beforeEach, describe, expect, it, vi } from 'vitest'

// D2-T1 — restoreWorkspaceBackupSelective: doc/folder filter with union semantics.
// Mocks the archive parser + the doc/folder repos. The backup entry shape is the
// REAL one: { meta: { id, title, folderId, file }, content }. folderPrefixes match
// against the folder-name path derived from meta.folderId via listFolders.

const { parseWorkspaceBackup, createDocument, getDocument, listFolders } = vi.hoisted(() => ({
  parseWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
  createDocument: vi.fn<() => Promise<{ id: string }>>(),
  getDocument: vi.fn<(id: string) => Promise<unknown>>(),
  listFolders: vi.fn<() => Promise<unknown[]>>(),
}))

vi.mock('@/lib/backup/archive', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, parseWorkspaceBackup }
})
vi.mock('@/lib/docs/repo', () => ({
  createDocument,
  getDocument,
  listDocuments: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/docs/folders-repo', () => ({ listFolders }))

const OWNER = 'owner-1'
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

// Two folders: work/ and personal/ (flat, both root-level).
const FOLDERS = [
  { id: 'f-work', name: 'work', parentId: null },
  { id: 'f-pers', name: 'personal', parentId: null },
]

function entry(id: string, title: string, folderId: string | null) {
  return { meta: { id, title, folderId, file: `docs/${id}.json` }, content: { type: 'doc' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  listFolders.mockResolvedValue(FOLDERS)
  getDocument.mockResolvedValue(null) // nothing exists by default
  createDocument.mockResolvedValue({ id: 'new' })
})

describe('restoreWorkspaceBackupSelective', () => {
  it('empty filter restores everything (filtered === 0)', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'Note A', null), entry('2', 'Note B', null)],
      warnings: [],
    })
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, {})
    expect(r.created).toBe(2)
    expect(r.filtered).toBe(0)
    expect(createDocument).toHaveBeenCalledTimes(2)
  })

  it('docTitles filter restores only the matching title', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'Note A', null), entry('2', 'Note B', null)],
      warnings: [],
    })
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, { docTitles: ['Note A'] })
    expect(r.created).toBe(1)
    expect(r.filtered).toBe(1)
  })

  it('folderPrefixes filter restores only docs under that folder path', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'todo', 'f-work'), entry('2', 'diary', 'f-pers')],
      warnings: [],
    })
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, { folderPrefixes: ['work/'] })
    expect(r.created).toBe(1)
    expect(r.filtered).toBe(1)
  })

  it('folderPrefixes + docTitles is a UNION (either match includes the doc)', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'todo', 'f-work'), entry('2', 'diary', 'f-pers')],
      warnings: [],
    })
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, {
      folderPrefixes: ['work/'],
      docTitles: ['diary'],
    })
    // work/todo matches the prefix; diary matches the title → both included.
    expect(r.created).toBe(2)
    expect(r.filtered).toBe(0)
  })

  it('a title not present in the backup filters everything, no throw', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'Note A', null), entry('2', 'Note B', null)],
      warnings: [],
    })
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, { docTitles: ['Ghost'] })
    expect(r.created).toBe(0)
    expect(r.filtered).toBe(2)
  })

  it('an already-existing doc is skipped (not filtered)', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [entry('1', 'Note A', null), entry('2', 'Note B', null)],
      warnings: [],
    })
    // Doc id '1' already exists → skipped, not filtered.
    getDocument.mockImplementation(async (id: string) =>
      id === '1' ? { id: '1', ownerId: OWNER } : null,
    )
    const { restoreWorkspaceBackupSelective } = await import('@/lib/backup/service')
    const r = await restoreWorkspaceBackupSelective(OWNER, BYTES, {})
    expect(r.skipped).toBe(1)
    expect(r.created).toBe(1)
    expect(r.filtered).toBe(0)
  })
})
