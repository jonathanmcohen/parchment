import { describe, expect, it } from 'vitest'
import { isSupportedLanguage, normalizeLang, TOP_LANGUAGES } from '@/lib/editor/shiki/languages'

describe('normalizeLang', () => {
  it('maps ts to typescript', () => {
    expect(normalizeLang('ts')).toBe('typescript')
  })

  it('maps py to python', () => {
    expect(normalizeLang('py')).toBe('python')
  })

  it('maps c++ to cpp', () => {
    expect(normalizeLang('c++')).toBe('cpp')
  })

  it('maps c# to csharp', () => {
    expect(normalizeLang('c#')).toBe('csharp')
  })

  it('maps null to plaintext', () => {
    expect(normalizeLang(null)).toBe('plaintext')
  })

  it('maps undefined to plaintext', () => {
    expect(normalizeLang(undefined)).toBe('plaintext')
  })

  it('passes typescript through unchanged', () => {
    expect(normalizeLang('typescript')).toBe('typescript')
  })

  it('maps totally-unknown to plaintext', () => {
    expect(normalizeLang('totally-unknown')).toBe('plaintext')
  })

  it('maps empty string to plaintext', () => {
    expect(normalizeLang('')).toBe('plaintext')
  })

  it('maps yml to yaml', () => {
    expect(normalizeLang('yml')).toBe('yaml')
  })

  it('maps sh to bash', () => {
    expect(normalizeLang('sh')).toBe('bash')
  })

  it('maps js to javascript', () => {
    expect(normalizeLang('js')).toBe('javascript')
  })

  it('maps md to markdown', () => {
    expect(normalizeLang('md')).toBe('markdown')
  })
})

describe('isSupportedLanguage', () => {
  it('returns true for typescript', () => {
    expect(isSupportedLanguage('typescript')).toBe(true)
  })

  it('returns true for python', () => {
    expect(isSupportedLanguage('python')).toBe(true)
  })

  it('returns true for go', () => {
    expect(isSupportedLanguage('go')).toBe(true)
  })

  it('returns true for rust', () => {
    expect(isSupportedLanguage('rust')).toBe(true)
  })

  it('returns true for diff', () => {
    expect(isSupportedLanguage('diff')).toBe(true)
  })

  it('returns false for plaintext (no highlighting)', () => {
    expect(isSupportedLanguage('plaintext')).toBe(false)
  })

  it('returns false for unknown langs', () => {
    expect(isSupportedLanguage('totally-unknown')).toBe(false)
  })

  it('returns false for short aliases (not canonical ids)', () => {
    expect(isSupportedLanguage('ts')).toBe(false)
    expect(isSupportedLanguage('py')).toBe(false)
  })
})

describe('TOP_LANGUAGES', () => {
  it('contains at least 45 entries', () => {
    expect(TOP_LANGUAGES.length).toBeGreaterThanOrEqual(45)
  })

  it('contains typescript', () => {
    expect(TOP_LANGUAGES).toContain('typescript')
  })

  it('contains python', () => {
    expect(TOP_LANGUAGES).toContain('python')
  })

  it('contains go', () => {
    expect(TOP_LANGUAGES).toContain('go')
  })

  it('contains rust', () => {
    expect(TOP_LANGUAGES).toContain('rust')
  })

  it('contains diff', () => {
    expect(TOP_LANGUAGES).toContain('diff')
  })

  it('does not contain plaintext (plaintext means no highlighting)', () => {
    expect(TOP_LANGUAGES).not.toContain('plaintext')
  })
})
