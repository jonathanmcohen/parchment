// D4: unit tests for cursor-related helpers used by CollaborationCaret.
//
// The provider + editor wiring is integration-level and verified by browser
// testing (two tabs, same doc). This file covers the pure-logic pieces:
//   • authorColor(id) → stable hex colour (reused from track-changes)
//   • initials(name) → display helper for presence avatars

import { describe, expect, it } from 'vitest'
import { authorColor } from '@/lib/editor/track-changes'

// ── initials helper ────────────────────────────────────────────────────────
// Derives a 1–2 character abbreviation from a full name.
// Not yet a named export — inline here so the tests define the contract
// that the future presence-avatar component can import.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase()
  return ((parts[0]?.charAt(0) ?? '') + (parts[parts.length - 1]?.charAt(0) ?? '')).toUpperCase()
}

describe('authorColor (cursor colour)', () => {
  it('returns a hex string for a user id', () => {
    const c = authorColor('user-uuid-abc123')
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is stable — same id always maps to same colour', () => {
    const id = 'a1b2c3d4-0000-0000-0000-000000000000'
    expect(authorColor(id)).toBe(authorColor(id))
  })

  it('different ids produce colours (not guaranteed different, but function runs)', () => {
    const c1 = authorColor('user-alice')
    const c2 = authorColor('user-bob')
    // Both must be valid hex; they may coincidentally be equal (palette wraps).
    expect(c1).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c2).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('initials', () => {
  it('single-word name → first letter uppercased', () => {
    expect(initials('alice')).toBe('A')
  })

  it('two-word name → first letters of each word uppercased', () => {
    expect(initials('Alice Wonderland')).toBe('AW')
  })

  it('three-word name → first + last word initials', () => {
    expect(initials('Mary Jane Watson')).toBe('MW')
  })

  it('empty string → ?', () => {
    expect(initials('')).toBe('?')
  })

  it('extra whitespace is collapsed', () => {
    expect(initials('  Bob   Ross  ')).toBe('BR')
  })
})
