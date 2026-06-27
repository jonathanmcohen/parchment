import { describe, expect, it } from 'vitest'
import { canAssignRole, hasRoleAtLeast, isAdmin, ROLE_RANK, roleRank } from '@/lib/auth/roles'

describe('A2 role lattice', () => {
  it('ranks owner > admin > editor > viewer', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin)
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer)
  })
  it('unknown role ranks below viewer', () => {
    expect(roleRank('banana')).toBe(-1)
  })
  it('hasRoleAtLeast is inclusive of equal rank', () => {
    expect(hasRoleAtLeast({ role: 'admin' }, 'admin')).toBe(true)
    expect(hasRoleAtLeast({ role: 'editor' }, 'admin')).toBe(false)
    expect(hasRoleAtLeast({ role: 'owner' }, 'viewer')).toBe(true)
  })
  it('isAdmin is owner or admin only', () => {
    expect(isAdmin({ role: 'owner' })).toBe(true)
    expect(isAdmin({ role: 'admin' })).toBe(true)
    expect(isAdmin({ role: 'editor' })).toBe(false)
    expect(isAdmin({ role: 'viewer' })).toBe(false)
  })
  it('canAssignRole blocks privilege escalation: actor cannot grant at or above own rank (except owner)', () => {
    // an admin may create/assign up to editor, never admin or owner
    expect(canAssignRole({ role: 'admin' }, 'editor')).toBe(true)
    expect(canAssignRole({ role: 'admin' }, 'viewer')).toBe(true)
    expect(canAssignRole({ role: 'admin' }, 'admin')).toBe(false)
    expect(canAssignRole({ role: 'admin' }, 'owner')).toBe(false)
    // owner may assign any non-owner role; 'owner' itself only via transferOwnership
    expect(canAssignRole({ role: 'owner' }, 'admin')).toBe(true)
    expect(canAssignRole({ role: 'owner' }, 'owner')).toBe(false)
    // editor/viewer may assign nothing
    expect(canAssignRole({ role: 'editor' }, 'viewer')).toBe(false)
  })
})
