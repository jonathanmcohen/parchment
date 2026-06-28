// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { describeCriteria, parseCriteria } from '@/lib/docs/smart-folder-criteria'

describe('parseCriteria', () => {
  it('returns empty object for null input', () => {
    expect(parseCriteria(null)).toEqual({})
  })

  it('returns empty object for non-object input', () => {
    expect(parseCriteria('string')).toEqual({})
    expect(parseCriteria(42)).toEqual({})
    expect(parseCriteria([])).toEqual({})
  })

  it('drops unknown keys', () => {
    const result = parseCriteria({ titleContains: 'hi', unknownKey: true, another: 123 })
    expect(result).not.toHaveProperty('unknownKey')
    expect(result).not.toHaveProperty('another')
    expect(result).toHaveProperty('titleContains', 'hi')
  })

  it('trims titleContains and omits when empty', () => {
    expect(parseCriteria({ titleContains: '  report  ' })).toEqual({ titleContains: 'report' })
    expect(parseCriteria({ titleContains: '   ' })).toEqual({})
    expect(parseCriteria({ titleContains: '' })).toEqual({})
  })

  it('coerces non-bool starred to omit', () => {
    expect(parseCriteria({ starred: 'yes' })).toEqual({})
    expect(parseCriteria({ starred: 1 })).toEqual({})
    expect(parseCriteria({ starred: false })).toEqual({})
    expect(parseCriteria({ starred: true })).toEqual({ starred: true })
  })

  it('passes folderId null through', () => {
    const result = parseCriteria({ folderId: null })
    expect(result).toHaveProperty('folderId', null)
    expect('folderId' in result).toBe(true)
  })

  it('passes folderId string through', () => {
    const result = parseCriteria({ folderId: 'abc-123' })
    expect(result).toHaveProperty('folderId', 'abc-123')
  })

  it('omits folderId when value is not null or string', () => {
    const result = parseCriteria({ folderId: 42 })
    expect('folderId' in result).toBe(false)
  })

  // J2-1 — broadened criteria coverage
  it('parses a string tagId through', () => {
    expect(parseCriteria({ tagId: 'tag-123' })).toEqual({ tagId: 'tag-123' })
  })

  it('omits tagId when not a non-empty string', () => {
    expect('tagId' in parseCriteria({ tagId: 42 })).toBe(false)
    expect('tagId' in parseCriteria({ tagId: '' })).toBe(false)
    expect('tagId' in parseCriteria({ tagId: '   ' })).toBe(false)
  })

  it('parses a positive integer updatedWithinDays', () => {
    expect(parseCriteria({ updatedWithinDays: 7 })).toEqual({ updatedWithinDays: 7 })
  })

  it('coerces a numeric-string updatedWithinDays', () => {
    expect(parseCriteria({ updatedWithinDays: '30' })).toEqual({ updatedWithinDays: 30 })
  })

  it('omits a non-positive / non-numeric / fractional updatedWithinDays', () => {
    expect('updatedWithinDays' in parseCriteria({ updatedWithinDays: 0 })).toBe(false)
    expect('updatedWithinDays' in parseCriteria({ updatedWithinDays: -5 })).toBe(false)
    expect('updatedWithinDays' in parseCriteria({ updatedWithinDays: 'soon' })).toBe(false)
    expect('updatedWithinDays' in parseCriteria({ updatedWithinDays: 1.5 })).toBe(false)
  })

  it('parses all new criteria together with the existing ones', () => {
    expect(
      parseCriteria({ titleContains: 'q', starred: true, tagId: 't1', updatedWithinDays: 14 }),
    ).toEqual({ titleContains: 'q', starred: true, tagId: 't1', updatedWithinDays: 14 })
  })
})

describe('describeCriteria', () => {
  it('returns "all documents" for empty criteria', () => {
    expect(describeCriteria({})).toBe('all documents')
  })

  it('describes titleContains only', () => {
    expect(describeCriteria({ titleContains: 'report' })).toBe('title contains "report"')
  })

  it('describes starred only', () => {
    expect(describeCriteria({ starred: true })).toBe('starred')
  })

  it('describes combined criteria', () => {
    expect(describeCriteria({ titleContains: 'report', starred: true })).toBe(
      'title contains "report" · starred',
    )
  })

  it('describes folderId null as in root folder', () => {
    expect(describeCriteria({ folderId: null })).toBe('in root folder')
  })

  it('describes folderId string', () => {
    expect(describeCriteria({ folderId: 'abc-123' })).toBe('in folder abc-123')
  })

  // J2-1 — descriptions for the new criteria
  it('describes tagId', () => {
    expect(describeCriteria({ tagId: 'tag-9' })).toBe('tagged tag-9')
  })

  it('describes updatedWithinDays (singular + plural)', () => {
    expect(describeCriteria({ updatedWithinDays: 1 })).toBe('updated in the last day')
    expect(describeCriteria({ updatedWithinDays: 7 })).toBe('updated in the last 7 days')
  })

  it('joins new criteria into the combined description', () => {
    expect(describeCriteria({ starred: true, updatedWithinDays: 30 })).toBe(
      'starred · updated in the last 30 days',
    )
  })
})
