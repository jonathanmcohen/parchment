import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTranscript, getSpeechRecognition, isVoiceSupported } from '@/lib/editor/voice'

// ---------------------------------------------------------------------------
// formatTranscript — pure function, bulk of the tests
// ---------------------------------------------------------------------------

describe('formatTranscript', () => {
  it('returns empty string for empty input', () => {
    expect(formatTranscript('', { atSentenceStart: false, precededBySpace: true })).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(formatTranscript('   ', { atSentenceStart: false, precededBySpace: true })).toBe('')
  })

  it('maps "period" to "." with no leading space', () => {
    const result = formatTranscript('period', { atSentenceStart: false, precededBySpace: false })
    expect(result).toBe('.')
  })

  it('maps "comma" to "," with no leading space', () => {
    const result = formatTranscript('comma', { atSentenceStart: false, precededBySpace: false })
    expect(result).toBe(',')
  })

  it('maps "question mark" to "?" with no leading space', () => {
    const result = formatTranscript('question mark', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('?')
  })

  it('maps "exclamation mark" to "!" with no leading space', () => {
    const result = formatTranscript('exclamation mark', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('!')
  })

  it('maps "exclamation point" to "!" with no leading space', () => {
    const result = formatTranscript('exclamation point', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('!')
  })

  it('maps "new line" to "\\n" with no leading space', () => {
    const result = formatTranscript('new line', { atSentenceStart: false, precededBySpace: false })
    expect(result).toBe('\n')
  })

  it('maps "new paragraph" to "\\n" with no leading space', () => {
    const result = formatTranscript('new paragraph', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('\n')
  })

  it('maps "open quote" to \'"\'', () => {
    const result = formatTranscript('open quote', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('"')
  })

  it('maps "close quote" to \'"\'', () => {
    const result = formatTranscript('close quote', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('"')
  })

  it('capitalizes at sentence start', () => {
    const result = formatTranscript('hello world', { atSentenceStart: true, precededBySpace: true })
    expect(result).toBe('Hello world')
  })

  it('leaves word lowercase mid-sentence', () => {
    const result = formatTranscript('hello world', {
      atSentenceStart: false,
      precededBySpace: true,
    })
    expect(result).toBe('hello world')
  })

  it('adds a joining space when precededBySpace is false and chunk is a word', () => {
    const result = formatTranscript('world', { atSentenceStart: false, precededBySpace: false })
    expect(result).toBe(' world')
  })

  it('does not add extra space when precededBySpace is true', () => {
    const result = formatTranscript('world', { atSentenceStart: false, precededBySpace: true })
    expect(result).toBe('world')
  })

  it('capitalizes and adds no extra space at sentence start with precededBySpace true', () => {
    const result = formatTranscript('the quick', { atSentenceStart: true, precededBySpace: true })
    expect(result).toBe('The quick')
  })

  it('capitalizes and adds joining space at sentence start with precededBySpace false', () => {
    // e.g. cursor right after a newline token that was not itself whitespace
    const result = formatTranscript('the quick', { atSentenceStart: true, precededBySpace: false })
    expect(result).toBe(' The quick')
  })

  it('is case-insensitive for punctuation tokens', () => {
    expect(formatTranscript('Period', { atSentenceStart: false, precededBySpace: false })).toBe('.')
    expect(formatTranscript('COMMA', { atSentenceStart: false, precededBySpace: false })).toBe(',')
  })

  it('trims stray whitespace from the API before mapping', () => {
    const result = formatTranscript('  period  ', {
      atSentenceStart: false,
      precededBySpace: false,
    })
    expect(result).toBe('.')
  })
})

// ---------------------------------------------------------------------------
// isVoiceSupported / getSpeechRecognition — environment-bound, stub globalThis
// ---------------------------------------------------------------------------

describe('isVoiceSupported', () => {
  afterEach(() => {
    // Clean up any stubs we set.
    delete (globalThis as Record<string, unknown>).SpeechRecognition
    delete (globalThis as Record<string, unknown>).webkitSpeechRecognition
  })

  it('returns false when neither SpeechRecognition nor webkitSpeechRecognition exists', () => {
    expect(isVoiceSupported()).toBe(false)
  })

  it('returns true when SpeechRecognition is present', () => {
    ;(globalThis as Record<string, unknown>).SpeechRecognition = vi.fn()
    expect(isVoiceSupported()).toBe(true)
  })

  it('returns true when webkitSpeechRecognition is present', () => {
    ;(globalThis as Record<string, unknown>).webkitSpeechRecognition = vi.fn()
    expect(isVoiceSupported()).toBe(true)
  })
})

describe('getSpeechRecognition', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SpeechRecognition
    delete (globalThis as Record<string, unknown>).webkitSpeechRecognition
  })

  it('returns null when neither constructor exists', () => {
    expect(getSpeechRecognition()).toBeNull()
  })

  it('returns SpeechRecognition constructor when present', () => {
    const FakeCtor = vi.fn()
    ;(globalThis as Record<string, unknown>).SpeechRecognition = FakeCtor
    expect(getSpeechRecognition()).toBe(FakeCtor)
  })

  it('returns webkitSpeechRecognition as fallback', () => {
    const FakeCtor = vi.fn()
    ;(globalThis as Record<string, unknown>).webkitSpeechRecognition = FakeCtor
    expect(getSpeechRecognition()).toBe(FakeCtor)
  })
})
