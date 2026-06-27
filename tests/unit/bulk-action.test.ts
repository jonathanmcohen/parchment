// J11-1: pure validator for the /api/docs/bulk request body. No db / no network.
// Validates the action + required fields and normalizes ids; the route maps the
// result to repo calls. Covers the NEW restore / delete actions plus the existing
// move / trash / tag.

import { describe, expect, it } from 'vitest'
import { parseBulkRequest } from '@/lib/docs/bulk-action'

describe('parseBulkRequest', () => {
  it('rejects a non-array ids', () => {
    const r = parseBulkRequest({ ids: 'nope', action: 'trash' })
    expect(r.ok).toBe(false)
  })

  it('rejects an empty ids array', () => {
    const r = parseBulkRequest({ ids: [], action: 'trash' })
    expect(r.ok).toBe(false)
  })

  it('rejects ids that are not all strings', () => {
    const r = parseBulkRequest({ ids: ['a', 2], action: 'trash' })
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown action', () => {
    const r = parseBulkRequest({ ids: ['a'], action: 'explode' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/action/i)
  })

  it('accepts trash', () => {
    const r = parseBulkRequest({ ids: ['a', 'b'], action: 'trash' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe('trash')
    expect(r.ids).toEqual(['a', 'b'])
  })

  it('accepts restore (new)', () => {
    const r = parseBulkRequest({ ids: ['a'], action: 'restore' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe('restore')
  })

  it('accepts delete (new, permanent)', () => {
    const r = parseBulkRequest({ ids: ['a'], action: 'delete' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe('delete')
  })

  it('requires tagId for the tag action', () => {
    const bad = parseBulkRequest({ ids: ['a'], action: 'tag' })
    expect(bad.ok).toBe(false)
    const good = parseBulkRequest({ ids: ['a'], action: 'tag', tagId: 't1' })
    expect(good.ok).toBe(true)
    if (!good.ok || good.action !== 'tag') return
    expect(good.tagId).toBe('t1')
  })

  it('normalizes folderId for move: null stays null, string passes, junk → null', () => {
    const root = parseBulkRequest({ ids: ['a'], action: 'move', folderId: null })
    expect(root.ok).toBe(true)
    if (root.ok && root.action === 'move') expect(root.folderId).toBeNull()

    const into = parseBulkRequest({ ids: ['a'], action: 'move', folderId: 'f1' })
    if (into.ok && into.action === 'move') expect(into.folderId).toBe('f1')

    const junk = parseBulkRequest({ ids: ['a'], action: 'move', folderId: 42 })
    if (junk.ok && junk.action === 'move') expect(junk.folderId).toBeNull()
  })
})
