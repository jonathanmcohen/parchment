import { describe, expect, it } from 'vitest'
import { permissionToRole } from '@/lib/docs/share-grant'

// H Task 7 (unit, pure) — map a share row's permission level to a DocPermRole.
// view→viewer, comment→commenter, edit→editor, suggest→editor (suggest is an
// edit-via-tracked-changes; the tracked-changes gating is UI-layer only).

describe('permissionToRole', () => {
  it('view → viewer', () => {
    expect(permissionToRole('view')).toBe('viewer')
  })
  it('comment → commenter', () => {
    expect(permissionToRole('comment')).toBe('commenter')
  })
  it('edit → editor', () => {
    expect(permissionToRole('edit')).toBe('editor')
  })
  it('suggest → editor (edit-via-tracked-changes)', () => {
    expect(permissionToRole('suggest')).toBe('editor')
  })
})
