import 'server-only'
import type { ComposeRequest } from '@/lib/ai/prompts'
import { buildMessages } from '@/lib/ai/prompts'

const INPUT_CAP = 8000

/** AI is enabled only when AI_BASE_URL is configured. Off by default. */
export function isAiEnabled(): boolean {
  return !!process.env.AI_BASE_URL
}

/**
 * Proxy a compose request to the configured OpenAI-compatible chat endpoint.
 * POST {AI_BASE_URL}/chat/completions
 * Body: { model, messages: [{role:'system',...},{role:'user',...}], temperature: 0.7, stream: false }
 * Header Authorization: Bearer {AI_API_KEY} when set.
 * model = AI_MODEL ?? 'llama3.1'
 *
 * Returns the assistant message content (trimmed, fences stripped) or null on
 * disabled/error/empty. NEVER throws.
 */
export async function composeText(req: ComposeRequest): Promise<string | null> {
  if (!isAiEnabled()) return null

  const baseUrl = process.env.AI_BASE_URL as string
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL ?? 'llama3.1'

  // Cap input to prevent excessive token usage
  const capped: ComposeRequest = { ...req, text: req.text.slice(0, INPUT_CAP) }
  const { system, user } = buildMessages(capped)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        stream: false,
      }),
    })

    if (!res.ok) return null

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') return null

    // Trim and strip a leading/trailing ``` fence if the model added one
    let result = raw.trim()
    if (result.startsWith('```')) {
      result = result
        .replace(/^```[^\n]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
    }

    return result.length > 0 ? result : null
  } catch {
    return null
  }
}
