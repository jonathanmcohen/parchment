import { describe, expect, it } from 'vitest'
import { diffMarkdown, parseUnifiedHunks, unifiedPatch } from '@/lib/docs/version-diff'

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

describe('parseUnifiedHunks', () => {
  it('classifies added lines as "add"', () => {
    const patch = unifiedPatch('a\nb', 'a\nc')
    const hunks = parseUnifiedHunks(patch)
    const addLines = hunks.filter((l) => l.kind === 'add')
    expect(addLines.some((l) => l.text.startsWith('+c'))).toBe(true)
  })

  it('classifies removed lines as "del"', () => {
    const patch = unifiedPatch('a\nb', 'a\nc')
    const hunks = parseUnifiedHunks(patch)
    const delLines = hunks.filter((l) => l.kind === 'del')
    expect(delLines.some((l) => l.text.startsWith('-b'))).toBe(true)
  })

  it('classifies @@ lines as "hunk"', () => {
    const patch = unifiedPatch('a\nb', 'a\nc')
    const hunks = parseUnifiedHunks(patch)
    expect(hunks.some((l) => l.kind === 'hunk')).toBe(true)
  })

  it('classifies --- and +++ header lines as "meta"', () => {
    const patch = unifiedPatch('a', 'b', 'old', 'new')
    const hunks = parseUnifiedHunks(patch)
    const metaLines = hunks.filter((l) => l.kind === 'meta')
    expect(metaLines.some((l) => l.text.startsWith('---'))).toBe(true)
    expect(metaLines.some((l) => l.text.startsWith('+++'))).toBe(true)
  })

  it('classifies unchanged lines as "context"', () => {
    const patch = unifiedPatch('a\nb\nc', 'a\nB\nc')
    const hunks = parseUnifiedHunks(patch)
    const ctxLines = hunks.filter((l) => l.kind === 'context')
    // 'a' and 'c' are unchanged context lines
    expect(ctxLines.some((l) => l.text.includes('a'))).toBe(true)
  })

  it('never throws on any input', () => {
    expect(() => parseUnifiedHunks('')).not.toThrow()
    expect(() => parseUnifiedHunks(unifiedPatch('', ''))).not.toThrow()
    expect(() => parseUnifiedHunks(unifiedPatch('hello', 'world'))).not.toThrow()
  })
})
