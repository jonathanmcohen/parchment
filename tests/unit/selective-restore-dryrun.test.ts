import { beforeEach, describe, expect, it, vi } from 'vitest'

// D2-T3 — POST /api/settings/backup/restore/dry-run. Parses an uploaded zip,
// applies the selective filter WITHOUT writing, returns the per-entry inclusion
// + would-create/skip/filtered counts.

const {
  authenticateRequest,
  isAdmin,
  parseWorkspaceBackup,
  matchesSelectiveFilter,
  entryFolderPath,
  listFolders,
  listDocuments,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  parseWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
  matchesSelectiveFilter: vi.fn<(e: unknown, f: unknown, folders: unknown) => boolean>(),
  entryFolderPath: vi.fn<(e: { meta: { title: string } }) => string>(),
  listFolders: vi.fn<() => Promise<unknown[]>>(),
  listDocuments: vi.fn<() => Promise<{ id: string }[]>>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/backup/service', () => ({
  parseWorkspaceBackup,
  matchesSelectiveFilter,
  entryFolderPath,
}))
vi.mock('@/lib/docs/folders-repo', () => ({ listFolders }))
vi.mock('@/lib/docs/repo', () => ({ listDocuments }))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const PK_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

function entry(id: string, title: string) {
  return { meta: { id, title, folderId: null, file: `docs/${id}.json` }, content: {} }
}

function makeReq(opts: {
  bytes?: Uint8Array
  filter?: Record<string, unknown>
  noFile?: boolean
  contentLength?: string
  badForm?: boolean
}) {
  const fd = new FormData()
  if (!opts.noFile) {
    const file = new File([(opts.bytes ?? PK_ZIP) as BlobPart], 'backup.zip', {
      type: 'application/zip',
    })
    fd.set('zip', file)
  }
  if (opts.filter) fd.set('filter', JSON.stringify(opts.filter))
  const headers = new Map<string, string>()
  if (opts.contentLength) headers.set('content-length', opts.contentLength)
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    formData: async () => {
      if (opts.badForm) throw new Error('bad multipart')
      return fd
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  listFolders.mockResolvedValue([])
  listDocuments.mockResolvedValue([])
  entryFolderPath.mockReturnValue('')
  // Default: include everything.
  matchesSelectiveFilter.mockReturnValue(true)
  parseWorkspaceBackup.mockResolvedValue({
    entries: [entry('1', 'Note A'), entry('2', 'Note B')],
    warnings: [],
  })
})

describe('POST /api/settings/backup/restore/dry-run', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    expect((await POST(makeReq({}))).status).toBe(403)
  })

  it('no filter → all entries included', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.wouldCreate).toBe(2)
    expect(body.filtered).toBe(0)
    expect(body.entries).toHaveLength(2)
    expect(body.entries.every((e: { included: boolean }) => e.included)).toBe(true)
  })

  it('applies the filter and counts filtered/included WITHOUT writing', async () => {
    // Only "Note A" passes the filter.
    matchesSelectiveFilter.mockImplementation(
      (e) => (e as { meta: { title: string } }).meta.title === 'Note A',
    )
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    const res = await POST(makeReq({ filter: { docTitles: ['Note A'] } }))
    const body = await res.json()
    expect(body.wouldCreate).toBe(1)
    expect(body.filtered).toBe(1)
    const included = body.entries.filter((e: { included: boolean }) => e.included)
    expect(included).toHaveLength(1)
    expect(included[0].title).toBe('Note A')
  })

  it('counts wouldSkip for an included entry whose id already exists', async () => {
    listDocuments.mockResolvedValue([{ id: '1' }]) // Note A already exists
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    const res = await POST(makeReq({}))
    const body = await res.json()
    expect(body.wouldSkip).toBe(1)
    expect(body.wouldCreate).toBe(1)
  })

  it('malformed zip → 400', async () => {
    parseWorkspaceBackup.mockRejectedValue(new Error('Not a backup'))
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    expect((await POST(makeReq({}))).status).toBe(400)
  })

  it('413 when content-length exceeds 100 MB', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    const res = await POST(makeReq({ contentLength: String(200 * 1024 * 1024) }))
    expect(res.status).toBe(413)
  })

  it('400 when no zip file is present', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/dry-run/route')
    expect((await POST(makeReq({ noFile: true }))).status).toBe(400)
  })
})
