import { describe, expect, it } from 'vitest'
import { SETTINGS_NAV_GROUPS } from '@/app/(app)/settings/_nav'

// v0.2.2 #6: Security must sit directly under Account in the settings nav.

describe('settings nav order', () => {
  it('lists Account first and Security immediately after it', () => {
    const labels = SETTINGS_NAV_GROUPS.map((g) => g.label)
    expect(labels[0]).toBe('Account')
    expect(labels[1]).toBe('Security')
  })

  it('still contains every existing section (no row dropped by the reorder)', () => {
    const labels = SETTINGS_NAV_GROUPS.map((g) => g.label)
    for (const label of [
      'Account',
      'Security',
      'Workspace',
      'Admin',
      'Users',
      'Backup',
      'Developer',
      'Notifications',
      'About',
    ]) {
      expect(labels).toContain(label)
    }
  })

  it('keeps every href unique', () => {
    const hrefs = SETTINGS_NAV_GROUPS.map((g) => g.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
