import { describe, expect, it } from 'vitest'
import { isParchmentCacheKey, isParchmentDocDb } from '@/lib/offline/cache-names'

// The logout cache-clear predicates decide which Cache-Storage keys and which
// IndexedDB databases belong to Parchment (and must be purged on sign-out so a
// shared machine never leaks the previous user's cached shell or per-doc Yjs
// content). They are pure so the "what do we delete" rules are unit-testable
// without a real ServiceWorker / IndexedDB environment.

describe('isParchmentCacheKey — Cache-Storage keys to purge on logout', () => {
  it('matches every parchment-* shell cache (versioned + legacy)', () => {
    expect(isParchmentCacheKey('parchment-shell-0.2.10')).toBe(true)
    expect(isParchmentCacheKey('parchment-shell-dev')).toBe(true)
    expect(isParchmentCacheKey('parchment-v1')).toBe(true)
  })

  it('does not touch caches owned by other code', () => {
    expect(isParchmentCacheKey('workbox-precache-v2')).toBe(false)
    expect(isParchmentCacheKey('next-data')).toBe(false)
    expect(isParchmentCacheKey('')).toBe(false)
  })
})

describe('isParchmentDocDb — IndexedDB databases to purge on logout', () => {
  it('matches the per-doc Yjs stores (parchment-doc-<id>)', () => {
    expect(isParchmentDocDb('parchment-doc-abc123')).toBe(true)
    expect(isParchmentDocDb('parchment-doc-00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  it('does not match non-Parchment databases', () => {
    expect(isParchmentDocDb('keyval-store')).toBe(false)
    expect(isParchmentDocDb('firebaseLocalStorageDb')).toBe(false)
    // A bare prefix with no id is not a real per-doc store — still safe to skip.
    expect(isParchmentDocDb('parchment-doc-')).toBe(false)
    expect(isParchmentDocDb('')).toBe(false)
  })
})
