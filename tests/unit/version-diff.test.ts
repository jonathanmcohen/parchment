import { describe, expect, it } from 'vitest'
import { diffMarkdown, unifiedPatch } from '@/lib/docs/version-diff'

describe('diffMarkdown', () => {
  it('identifies del, add, and ctx lines for a single-line change', () => {
    const result = diffMarkdown('a\nb\nc', 'a\nB\nc')
    const delLines = result.filter((l) => l.type === 'del')
    const addLines = result.filter((l) => l.type === 'add')
    const ctxLines = result.filter((l) => l.type === 'ctx')

    expect(delLines.some((l) => l.text.includes('b'))).toBe(true)
    expect(addLines.some((l) => l.text.includes('B'))).toBe(true)
    expect(ctxLines.some((l) => l.text.includes('a'))).toBe(true)
    expect(ctxLines.some((l) => l.text.includes('c'))).toBe(true)
  })

  it('returns all ctx lines for identical inputs', () => {
    const result = diffMarkdown('x', 'x')
    expect(result.every((l) => l.type === 'ctx')).toBe(true)
    expect(result.some((l) => l.type === 'add' || l.type === 'del')).toBe(false)
  })

  it('handles empty old string', () => {
    const result = diffMarkdown('', 'hello')
    expect(result.some((l) => l.type === 'add')).toBe(true)
    expect(() => diffMarkdown('', 'hello')).not.toThrow()
  })

  it('handles empty new string', () => {
    const result = diffMarkdown('hello', '')
    expect(result.some((l) => l.type === 'del')).toBe(true)
    expect(() => diffMarkdown('hello', '')).not.toThrow()
  })

  it('handles both strings empty', () => {
    const result = diffMarkdown('', '')
    expect(result).toEqual([])
  })

  it('never throws on any input', () => {
    expect(() => diffMarkdown('a\nb\nc', 'd\ne\nf')).not.toThrow()
    expect(() => diffMarkdown('', '')).not.toThrow()
    expect(() => diffMarkdown('same', 'same')).not.toThrow()
  })
})

describe('unifiedPatch', () => {
  it('contains -b and +c for a single-line change', () => {
    const patch = unifiedPatch('a\nb', 'a\nc')
    expect(patch).toContain('-b')
    expect(patch).toContain('+c')
  })

  it('handles identical strings (no hunks)', () => {
    const patch = unifiedPatch('hello\nworld', 'hello\nworld')
    // No diff hunks — patch header may still be present but no +/- content lines
    expect(patch).not.toContain('-hello')
    expect(patch).not.toContain('+hello')
  })

  it('accepts optional labels', () => {
    const patch = unifiedPatch('a\nb', 'a\nc', 'v1', 'v2')
    expect(patch).toContain('v1')
    expect(patch).toContain('v2')
  })

  it('never throws', () => {
    expect(() => unifiedPatch('', '')).not.toThrow()
    expect(() => unifiedPatch('a', 'b')).not.toThrow()
    expect(() => unifiedPatch('', 'hello')).not.toThrow()
  })
})
