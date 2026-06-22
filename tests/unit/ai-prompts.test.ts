import { describe, expect, it } from 'vitest'
import { buildMessages, parseOperation } from '@/lib/ai/prompts'

describe('buildMessages', () => {
  it('improve — system is non-empty and user is the text', () => {
    const { system, user } = buildMessages({ operation: 'improve', text: 'hello world' })
    expect(system.length).toBeGreaterThan(0)
    expect(user).toBe('hello world')
    expect(system).toContain('clarity')
  })

  it('shorten — system is non-empty and user is the text', () => {
    const { system, user } = buildMessages({ operation: 'shorten', text: 'some long text' })
    expect(system.length).toBeGreaterThan(0)
    expect(user).toBe('some long text')
    expect(system).toContain('concise')
  })

  it('translate — system contains the targetLang and user is the text', () => {
    const { system, user } = buildMessages({
      operation: 'translate',
      text: 'bonjour',
      targetLang: 'Spanish',
    })
    expect(system).toContain('Spanish')
    expect(user).toBe('bonjour')
  })

  it('translate — falls back to English when targetLang is omitted', () => {
    const { system } = buildMessages({ operation: 'translate', text: 'test' })
    expect(system).toContain('English')
  })

  it('continue — system is non-empty and user is the exact text', () => {
    const { system, user } = buildMessages({ operation: 'continue', text: 'Once upon a time' })
    expect(system.length).toBeGreaterThan(0)
    expect(user).toBe('Once upon a time')
    expect(system).toContain('Continue')
  })

  it('every operation system prompt forbids preamble/fences', () => {
    for (const op of ['improve', 'shorten', 'translate', 'continue'] as const) {
      const { system } = buildMessages({ operation: op, text: 'x', targetLang: 'French' })
      // All prompts should instruct "ONLY"
      expect(system).toContain('ONLY')
    }
  })
})

describe('parseOperation', () => {
  it('maps known operations', () => {
    expect(parseOperation('improve')).toBe('improve')
    expect(parseOperation('shorten')).toBe('shorten')
    expect(parseOperation('translate')).toBe('translate')
    expect(parseOperation('continue')).toBe('continue')
  })

  it('returns null for unknown string', () => {
    expect(parseOperation('rewrite')).toBeNull()
    expect(parseOperation('summarize')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseOperation('')).toBeNull()
  })

  it('returns null for non-string values', () => {
    expect(parseOperation(null)).toBeNull()
    expect(parseOperation(undefined)).toBeNull()
    expect(parseOperation(42)).toBeNull()
    expect(parseOperation({})).toBeNull()
  })
})
