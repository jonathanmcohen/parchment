import { describe, expect, it } from 'vitest'
import type { AuditAction } from '@/lib/audit'

describe('A audit verbs — Phase-0 union already includes these (compile-time check)', () => {
  it('Phase-0 union contains all verbs A emits', () => {
    // This test is a compile-time assertion: if any of these literals is NOT in the
    // Phase-0 AuditAction union, TypeScript will error here — catching a missing
    // Phase-0 verb before the integration runs.
    // A does NOT extend the union; these strings must already exist in @/lib/audit.
    const verbs: AuditAction[] = [
      'user.create',
      'user.invite', // coordinate with Phase-0 author if this errors
      'user.disable',
      'user.enable', // coordinate with Phase-0 author if this errors
      'user.delete',
      'user.role',
      'ownership.transfer',
      'doc.share',
      'doc.unshare',
    ]
    expect(verbs.length).toBe(9)
  })
})
