import { beforeEach, describe, expect, it, vi } from 'vitest'

// P3 (v0.1.7): the editor rename runs through a Server Action so Next's
// action-response cache invalidation reaches the client Router Cache. These
// tests mock the deps and assert renameDocumentAction writes + revalidates only
// on a real, owned, non-empty rename — and reverts cleanly otherwise.

const { requireUser, getDocument, renameDocument, revalidatePath } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDocument: vi.fn(),
  renameDocument: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ requireUser }))
vi.mock('@/lib/docs/repo', () => ({ getDocument, renameDocument }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { renameDocumentAction } from '@/lib/docs/rename-action'

const ID = 'doc-123'

beforeEach(() => {
  vi.clearAllMocks()
  requireUser.mockResolvedValue({ id: 'u1' })
  getDocument.mockResolvedValue({ id: ID, ownerId: 'u1' })
  renameDocument.mockResolvedValue(undefined)
})

describe('renameDocumentAction — P3 Server Action rename', () => {
  it('renames and revalidates /files AND the doc page on success', async () => {
    const res = await renameDocumentAction(ID, 'Renamed')
    expect(res).toEqual({ ok: true })
    expect(renameDocument).toHaveBeenCalledWith('u1', ID, 'Renamed')
    expect(revalidatePath).toHaveBeenCalledWith('/files')
    expect(revalidatePath).toHaveBeenCalledWith(`/d/${ID}`)
  })

  it('trims the title before persisting', async () => {
    await renameDocumentAction(ID, '  Spaced  ')
    expect(renameDocument).toHaveBeenCalledWith('u1', ID, 'Spaced')
  })

  it('returns an error and does NOT write/revalidate on an empty title', async () => {
    const res = await renameDocumentAction(ID, '   ')
    expect(res).toEqual({ error: 'empty title' })
    expect(renameDocument).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns not found and does NOT write/revalidate when the caller is not the owner', async () => {
    getDocument.mockResolvedValue({ id: ID, ownerId: 'someone-else' })
    const res = await renameDocumentAction(ID, 'Renamed')
    expect(res).toEqual({ error: 'not found' })
    expect(renameDocument).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('maps a renameDocument empty-title throw to an error result (no revalidate)', async () => {
    renameDocument.mockRejectedValue(new Error('empty title'))
    const res = await renameDocumentAction(ID, 'x')
    expect(res).toEqual({ error: 'empty title' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
