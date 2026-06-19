import { describe, expect, it } from 'vitest'
import { sortRows } from '@/lib/editor/table-sort'

describe('sortRows', () => {
  const rows = [
    ['b', '2'],
    ['a', '10'],
    ['c', '1'],
  ]

  it('sorts column 0 ascending alphabetically', () => {
    const result = sortRows(rows, 0, 'asc')
    expect(result.map((r) => r[0])).toEqual(['a', 'b', 'c'])
  })

  it('sorts column 0 descending alphabetically', () => {
    const result = sortRows(rows, 0, 'desc')
    expect(result.map((r) => r[0])).toEqual(['c', 'b', 'a'])
  })

  it('sorts column 1 ascending numerically (10 > 2, not lexical)', () => {
    const result = sortRows(rows, 1, 'asc')
    // Numeric: 1, 2, 10
    expect(result.map((r) => r[1])).toEqual(['1', '2', '10'])
  })

  it('sorts column 1 descending numerically', () => {
    const result = sortRows(rows, 1, 'desc')
    // Numeric: 10, 2, 1
    expect(result.map((r) => r[1])).toEqual(['10', '2', '1'])
  })

  it('is stable: rows with equal values preserve original order', () => {
    const equalRows = [
      ['a', '5'],
      ['b', '5'],
      ['c', '5'],
    ]
    const result = sortRows(equalRows, 1, 'asc')
    expect(result.map((r) => r[0])).toEqual(['a', 'b', 'c'])
  })

  it('handles mixed numeric/string column with string fallback', () => {
    const mixedRows = [
      ['apple', 'foo'],
      ['banana', 'bar'],
      ['cherry', 'baz'],
    ]
    const result = sortRows(mixedRows, 1, 'asc')
    expect(result.map((r) => r[1])).toEqual(['bar', 'baz', 'foo'])
  })

  it('does not mutate the original array', () => {
    const original = [
      ['b', '2'],
      ['a', '10'],
    ]
    const copy = original.map((r) => [...r])
    sortRows(original, 0, 'asc')
    expect(original).toEqual(copy)
  })
})
