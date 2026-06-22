/**
 * Voice typing helpers — pure, no React, DOM-typed via local interfaces.
 * The SpeechRecognition constructor is read from window FRESH at call time,
 * so tests can inject a fake and exercise the full path without caching.
 */

// ---------------------------------------------------------------------------
// Minimal local types (avoid pulling a deps package)
// ---------------------------------------------------------------------------

export interface SpeechRecognitionResultItem {
  readonly transcript: string
  readonly confidence: number
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionResultItem
  [index: number]: SpeechRecognitionResultItem
}

export interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

export interface SpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

export interface SpeechRecognitionErrorEvent {
  readonly error: string
  readonly message: string
}

export interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

// Augment Window so TypeScript knows about the vendor-prefixed constructor.
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Use a typed view of globalThis so both browser (window) and test environments work.
type GlobalWithSpeech = typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

/** True when the browser exposes a SpeechRecognition constructor. Reads globalThis fresh. */
export function isVoiceSupported(): boolean {
  const g = globalThis as GlobalWithSpeech
  return Boolean(g.SpeechRecognition ?? g.webkitSpeechRecognition)
}

/** The SpeechRecognition constructor (or null). Reads globalThis fresh each call. */
export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const g = globalThis as GlobalWithSpeech
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null
}

// ---------------------------------------------------------------------------
// Spoken punctuation token map (standalone-word → symbol)
// ---------------------------------------------------------------------------

const PUNCT_TOKENS: ReadonlyMap<string, string> = new Map([
  ['period', '.'],
  ['comma', ','],
  ['question mark', '?'],
  ['exclamation mark', '!'],
  ['exclamation point', '!'],
  ['new line', '\n'],
  ['new paragraph', '\n'],
  ['open quote', '"'],
  ['close quote', '"'],
])

/**
 * Normalize a raw recognized transcript chunk for insertion:
 *  - trim leading/trailing stray whitespace
 *  - map spoken punctuation tokens to symbols (only when standalone)
 *  - ensure a single leading space when joining onto existing text that doesn't
 *    end in whitespace/open-bracket (caller passes `precededBySpace`)
 *  - capitalize the first alphabetic character when `atSentenceStart` is true
 *
 * Pure + deterministic.
 */
export function formatTranscript(
  raw: string,
  opts: { atSentenceStart: boolean; precededBySpace: boolean },
): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  // Check if the entire trimmed string matches a punctuation token.
  const lc = trimmed.toLowerCase()
  const punct = PUNCT_TOKENS.get(lc)
  if (punct !== undefined) {
    // Punctuation: never add a leading space (it attaches to the previous word).
    if (opts.atSentenceStart && /[a-zA-Z]/.test(punct)) {
      return punct.charAt(0).toUpperCase() + punct.slice(1)
    }
    return punct
  }

  // Regular text: optionally capitalize and add joining space.
  let text = trimmed

  if (opts.atSentenceStart) {
    // Capitalize first alphabetic character.
    text = text.replace(/[a-zA-Z]/, (ch) => ch.toUpperCase())
  }

  // Add a joining space when the preceding context doesn't end in whitespace/open-bracket.
  if (!opts.precededBySpace) {
    text = ` ${text}`
  }

  return text
}
