export type AiOperation = 'improve' | 'shorten' | 'translate' | 'continue'

export interface ComposeRequest {
  operation: AiOperation
  text: string
  targetLang?: string
}

/**
 * Build the {system,user} chat messages for an AI compose operation.
 * Pure + deterministic — no env, no network.
 */
export function buildMessages(req: ComposeRequest): { system: string; user: string } {
  switch (req.operation) {
    case 'improve':
      return {
        system:
          'You are a writing assistant. Rewrite the provided text to improve its clarity and grammar while keeping the meaning and length similar. Return ONLY the rewritten text — no preamble, no explanation, no markdown code fences.',
        user: req.text,
      }
    case 'shorten':
      return {
        system:
          'You are a writing assistant. Make the provided text more concise while preserving its core meaning. Return ONLY the shortened text — no preamble, no explanation, no markdown code fences.',
        user: req.text,
      }
    case 'translate':
      return {
        system: `You are a translation assistant. Translate the provided text to ${req.targetLang ?? 'English'}. Return ONLY the translated text — no preamble, no explanation, no markdown code fences.`,
        user: req.text,
      }
    case 'continue':
      return {
        system:
          'You are a writing assistant. Continue writing naturally from the provided text, matching its style and tone. Return ONLY the continuation — no preamble, no explanation, no markdown code fences.',
        user: req.text,
      }
  }
}

/**
 * Validate a raw operation string → AiOperation | null.
 * Returns null for unknown or empty values.
 */
export function parseOperation(raw: unknown): AiOperation | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (raw === 'improve' || raw === 'shorten' || raw === 'translate' || raw === 'continue') {
    return raw
  }
  return null
}
