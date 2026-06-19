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
})
