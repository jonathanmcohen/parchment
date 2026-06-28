// @vitest-environment node
// J8-2: pure scope matcher. Canonical taxonomy is EXACTLY 'docs:read' and
// 'docs:write' (no bare 'read'/'write' anywhere). 'docs:write' implies 'docs:read'.

import { describe, expect, it } from 'vitest'
import { ALL_SCOPES, hasScope, isScope, normalizeScopes } from '@/lib/auth/scopes'

describe('isScope', () => {
  it('accepts the two canonical scopes', () => {
    expect(isScope('docs:read')).toBe(true)
    expect(isScope('docs:write')).toBe(true)
  })
  it('rejects bare read/write and anything else', () => {
    expect(isScope('read')).toBe(false)
    expect(isScope('write')).toBe(false)
    expect(isScope('admin')).toBe(false)
    expect(isScope('')).toBe(false)
    expect(isScope('DOCS:READ')).toBe(false)
  })
})

describe('hasScope', () => {
  it('grants a scope explicitly present', () => {
    expect(hasScope(['docs:read'], 'docs:read')).toBe(true)
    expect(hasScope(['docs:write'], 'docs:write')).toBe(true)
  })
  it('docs:write implies docs:read', () => {
    expect(hasScope(['docs:write'], 'docs:read')).toBe(true)
  })
  it('docs:read does NOT imply docs:write', () => {
    expect(hasScope(['docs:read'], 'docs:write')).toBe(false)
  })
  it('an empty grant satisfies nothing', () => {
    expect(hasScope([], 'docs:read')).toBe(false)
    expect(hasScope([], 'docs:write')).toBe(false)
  })
  it('ignores unknown/garbage strings in the granted array', () => {
    // hasScope takes readonly string[] so unknown entries are fine without a cast.
    expect(hasScope(['read', 'docs:read'], 'docs:read')).toBe(true)
    expect(hasScope(['garbage'], 'docs:read')).toBe(false)
  })
})

describe('normalizeScopes', () => {
  it('keeps only canonical scopes, de-duplicated', () => {
    expect(normalizeScopes(['docs:read', 'docs:read', 'docs:write'])).toEqual([
      'docs:read',
      'docs:write',
    ])
  })
  it('drops bare read/write and unknowns (does not silently upgrade)', () => {
    expect(normalizeScopes(['read', 'write', 'docs:read'])).toEqual(['docs:read'])
  })
  it('returns [] for non-array / empty input', () => {
    expect(normalizeScopes(null)).toEqual([])
    expect(normalizeScopes(undefined)).toEqual([])
    expect(normalizeScopes('docs:read')).toEqual([])
    expect(normalizeScopes([])).toEqual([])
  })
})

describe('ALL_SCOPES', () => {
  it('is exactly the two canonical scopes', () => {
    expect([...ALL_SCOPES].sort()).toEqual(['docs:read', 'docs:write'])
  })
})
