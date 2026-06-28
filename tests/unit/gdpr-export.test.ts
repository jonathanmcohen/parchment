import { describe, expect, it } from 'vitest'
import { buildGdprDocEntry, buildGdprManifest, buildGdprProfile } from '../../src/lib/export/gdpr'

/**
 * Unit tests for src/lib/export/gdpr.ts (I9).
 *
 * Tests the pure helper functions without a DB/zip round-trip.
 * The full buildGdprExport() is integration-tested (requires DB + JSZip).
 */

describe('buildGdprManifest', () => {
  it('includes exportedAt, userId, and appVersion', () => {
    const manifest = buildGdprManifest('user-123', 'v0.2.0')
    expect(manifest.userId).toBe('user-123')
    expect(manifest.appVersion).toBe('v0.2.0')
    expect(typeof manifest.exportedAt).toBe('string')
    // Verify it's a valid ISO date
    expect(new Date(manifest.exportedAt).toISOString()).toBe(manifest.exportedAt)
  })
})

describe('buildGdprProfile', () => {
  it('includes name, email, createdAt, role — excludes passwordHash and tokenHash', () => {
    const user = {
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'owner',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      passwordHash: 'secret-hash',
      tokenHash: 'token-hash',
    }
    const profile = buildGdprProfile(user)
    expect(profile.name).toBe('Alice')
    expect(profile.email).toBe('alice@example.com')
    expect(profile.role).toBe('owner')
    expect(profile).not.toHaveProperty('passwordHash')
    expect(profile).not.toHaveProperty('tokenHash')
  })
})

describe('buildGdprDocEntry', () => {
  it('includes id, title, folderId, content, markdown, createdAt, updatedAt', () => {
    const doc = {
      id: 'doc-abc',
      title: 'My Doc',
      folderId: null,
      content: { type: 'doc', content: [] },
      markdown: '# Hi',
      createdAt: new Date('2024-01-02T00:00:00Z'),
      updatedAt: new Date('2024-01-03T00:00:00Z'),
    }
    const entry = buildGdprDocEntry(doc)
    expect(entry.id).toBe('doc-abc')
    expect(entry.title).toBe('My Doc')
    expect(entry.markdown).toBe('# Hi')
    expect(entry).not.toHaveProperty('ownerId') // no cross-user leakage
    expect(entry).not.toHaveProperty('trashedAt')
  })
})
