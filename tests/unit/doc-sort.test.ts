import { describe, expect, it } from 'vitest'
import type { SortableDoc } from '@/lib/docs/doc-sort'
import { sortDocs } from '@/lib/docs/doc-sort'

function makeDoc(overrides: Partial<SortableDoc> & { id?: string }): SortableDoc & { id: string } {
  return {
    id: overrides.id ?? 'x',
    title: overrides.title ?? 'Untitled',
    updatedAt: overrides.updatedAt ?? '2024-01-01T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    size: overrides.size ?? 0,
  }
}

const alpha = makeDoc({
  id: 'a',
  title: 'Alpha',
  updatedAt: '2024-03-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  size: 100,
})
const beta = makeDoc({
  id: 'b',
  title: 'beta',
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-03-01T00:00:00.000Z',
  size: 9,
})
const gamma = makeDoc({
  id: 'c',
  title: 'GAMMA',
  updatedAt: '2024-02-01T00:00:00.000Z',
  createdAt: '2024-02-01T00:00:00.000Z',
  size: 10,
})

describe('sortDocs', () => {
  it('sort by name asc is case-insensitive', () => {
    const result = sortDocs([gamma, beta, alpha], 'name', 'asc')
    expect(result.map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })

  it('sort by name desc reverses alphabetical order (case-insensitive)', () => {
    const result = sortDocs([alpha, beta, gamma], 'name', 'desc')
    expect(result.map((d) => d.id)).toEqual(['c', 'b', 'a'])
  })

  it('sort by modified asc — oldest updatedAt first', () => {
    const result = sortDocs([alpha, beta, gamma], 'modified', 'asc')
    expect(result.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('sort by modified desc — newest updatedAt first', () => {
    const result = sortDocs([beta, gamma, alpha], 'modified', 'desc')
    expect(result.map((d) => d.id)).toEqual(['a', 'c', 'b'])
  })

  it('sort by created asc — oldest createdAt first', () => {
    const result = sortDocs([gamma, beta, alpha], 'created', 'asc')
    expect(result.map((d) => d.id)).toEqual(['a', 'c', 'b'])
  })

  it('sort by created desc — newest createdAt first', () => {
    const result = sortDocs([alpha, gamma, beta], 'created', 'desc')
    expect(result.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('sort by size asc — numeric, not lexical: 9 < 10 < 100', () => {
    const result = sortDocs([alpha, beta, gamma], 'size', 'asc')
    expect(result.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('sort by size desc — largest first', () => {
    const result = sortDocs([beta, gamma, alpha], 'size', 'desc')
    expect(result.map((d) => d.id)).toEqual(['a', 'c', 'b'])
  })

  it('stable for equal keys — preserves relative input order for equal modified (tie-breaks on title)', () => {
    const d1 = makeDoc({
      id: 'z1',
      title: 'Zebra',
      updatedAt: '2024-01-01T00:00:00.000Z',
      size: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
    })
    const d2 = makeDoc({
      id: 'z2',
      title: 'Apple',
      updatedAt: '2024-01-01T00:00:00.000Z',
      size: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
    })
    const result = sortDocs([d1, d2], 'modified', 'asc')
    // Same modified, tie-break by title asc → Apple before Zebra
    expect(result.map((d) => d.id)).toEqual(['z2', 'z1'])
  })

  it('returns a new array — input is unmutated', () => {
    const input = [gamma, beta, alpha]
    const original = input.slice()
    const result = sortDocs(input, 'name', 'asc')
    // result is different array
    expect(result).not.toBe(input)
    // input unchanged
    expect(input.map((d) => d.id)).toEqual(original.map((d) => d.id))
  })
})
