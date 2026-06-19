/** Semantic search is enabled only when an embeddings endpoint is configured. */
export function isSemanticEnabled(): boolean {
  return !!process.env.EMBEDDINGS_URL
}

export const EMBEDDING_DIM = 768

/**
 * Embed text via an OpenAI-compatible endpoint (POST {EMBEDDINGS_URL}).
 * Body: { model: process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small', input: text }.
 * Header Authorization: Bearer {EMBEDDINGS_API_KEY} when set.
 * Returns the embedding as number[] of length EMBEDDING_DIM, or null when disabled,
 * on any error, or if the returned vector isn't EMBEDDING_DIM long. Never throws.
 */
export async function embed(text: string): Promise<number[] | null> {
  if (!isSemanticEnabled()) return null

  const url = process.env.EMBEDDINGS_URL as string
  const model = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small'
  const apiKey = process.env.EMBEDDINGS_API_KEY

  // Truncate very long input
  const input = text.slice(0, 8000)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input }),
    })

    if (!res.ok) return null

    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
    const embedding = json.data?.[0]?.embedding

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) return null

    return embedding
  } catch {
    return null
  }
}
