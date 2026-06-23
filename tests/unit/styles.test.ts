import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLES,
  type NamedStyle,
  parseStyles,
  resolveStyleProps,
} from '@/lib/editor/styles'

describe('resolveStyleProps', () => {
  it('merges a basedOn chain with the child winning', () => {
    const styles: NamedStyle[] = [
      { id: 'a', name: 'A', type: 'paragraph', props: { fontSize: '12pt', color: '#111111' } },
      {
        id: 'b',
        name: 'B',
        type: 'paragraph',
        basedOn: 'a',
        props: { color: '#222222', bold: true },
      },
      { id: 'c', name: 'C', type: 'paragraph', basedOn: 'b', props: { fontSize: '20pt' } },
    ]
    const resolved = resolveStyleProps(styles, 'c')
    // c overrides fontSize; b overrides color + adds bold; a contributes nothing left.
    expect(resolved).toEqual({ fontSize: '20pt', color: '#222222', bold: true })
  })

  it('is cycle-safe (no infinite loop)', () => {
    const styles: NamedStyle[] = [
      { id: 'x', name: 'X', type: 'character', basedOn: 'y', props: { bold: true } },
      { id: 'y', name: 'Y', type: 'character', basedOn: 'x', props: { italic: true } },
    ]
    const resolved = resolveStyleProps(styles, 'x')
    expect(resolved).toEqual({ bold: true, italic: true })
  })

  it('unknown id → empty props', () => {
    expect(resolveStyleProps(DEFAULT_STYLES, 'missing')).toEqual({})
    expect(resolveStyleProps([], 'anything')).toEqual({})
  })
})

describe('parseStyles', () => {
  it('drops malformed entries and keeps valid ones', () => {
    const raw = [
      { id: 'ok', name: 'OK', type: 'paragraph', props: { bold: true } },
      { id: '', name: 'no id', type: 'paragraph', props: {} },
      { id: 'bad-type', name: 'X', type: 'banana', props: {} },
      { name: 'missing id', type: 'character', props: {} },
      'not an object',
      null,
      { id: 'char', name: 'Char', type: 'character', basedOn: 'ok', props: { italic: 'yes' } },
    ]
    const parsed = parseStyles(raw)
    expect(parsed.map((s) => s.id)).toEqual(['ok', 'char'])
    // The mistyped italic: 'yes' is dropped (not a boolean).
    expect(parsed[1]?.props).toEqual({})
    expect(parsed[1]?.basedOn).toBe('ok')
  })

  it('non-array raw → empty list', () => {
    expect(parseStyles(null)).toEqual([])
    expect(parseStyles({})).toEqual([])
  })
})

describe('DEFAULT_STYLES', () => {
  it('is well-formed: round-trips through parseStyles unchanged', () => {
    const parsed = parseStyles(DEFAULT_STYLES)
    expect(parsed.length).toBe(DEFAULT_STYLES.length)
    for (const s of parsed) {
      expect(s.id).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(['paragraph', 'character']).toContain(s.type)
    }
  })

  it('has at least one paragraph and one character builtin', () => {
    expect(DEFAULT_STYLES.some((s) => s.type === 'paragraph')).toBe(true)
    expect(DEFAULT_STYLES.some((s) => s.type === 'character')).toBe(true)
  })
})
