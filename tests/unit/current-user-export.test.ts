import { describe, expect, it } from 'vitest'

describe('getCurrentUser stable export', () => {
  it('re-exports getCurrentUser and requireUser', async () => {
    const mod = await import('@/lib/auth/current-user')
    expect(typeof mod.getCurrentUser).toBe('function')
    expect(typeof mod.requireUser).toBe('function')
  })
})
