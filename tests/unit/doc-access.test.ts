import { describe, expect, it } from 'vitest'
import { canAccessDoc } from '@/lib/authz/doc-access'

const owner = { id: 'u-owner', role: 'editor' } // owner of the doc, any workspace role
const doc = { ownerId: 'u-owner' }
const stranger = { id: 'u-stranger', role: 'editor' }
const wsAdmin = { id: 'u-admin', role: 'admin' }

describe('A4 canAccessDoc', () => {
  it('the doc owner can do everything', () => {
    for (const a of ['view', 'comment', 'edit', 'manage'] as const)
      expect(canAccessDoc(owner, doc, a, null)).toBe(true)
  })
  it('a workspace admin can manage any doc (oversight)', () => {
    expect(canAccessDoc(wsAdmin, doc, 'manage', null)).toBe(true)
    expect(canAccessDoc(wsAdmin, doc, 'edit', null)).toBe(true)
  })
  it('a stranger with NO permission row is denied every action', () => {
    for (const a of ['view', 'comment', 'edit', 'manage'] as const)
      expect(canAccessDoc(stranger, doc, a, null)).toBe(false)
  })
  it('a viewer grant allows view only, never comment/edit/manage', () => {
    const perm = { role: 'viewer' as const }
    expect(canAccessDoc(stranger, doc, 'view', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'comment', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
  it('a commenter grant allows view+comment, never edit/manage', () => {
    const perm = { role: 'commenter' as const }
    expect(canAccessDoc(stranger, doc, 'view', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'comment', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
  it('an editor grant allows view+comment+edit, but NOT manage (sharing stays owner/admin)', () => {
    const perm = { role: 'editor' as const }
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
})
