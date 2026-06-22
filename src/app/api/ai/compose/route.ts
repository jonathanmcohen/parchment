import type { NextRequest } from 'next/server'
import { composeText, isAiEnabled } from '@/lib/ai/compose'
import { parseOperation } from '@/lib/ai/prompts'
import { authenticateRequest } from '@/lib/auth/guard'

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!isAiEnabled()) {
    return Response.json({ error: 'ai_disabled' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { operation: rawOp, text, targetLang } = body as Record<string, unknown>

  const operation = parseOperation(rawOp)
  if (!operation) {
    return Response.json({ error: 'invalid_operation' }, { status: 400 })
  }

  if (typeof text !== 'string' || text.length === 0) {
    return Response.json({ error: 'text_required' }, { status: 400 })
  }

  const result = await composeText({
    operation,
    text,
    ...(typeof targetLang === 'string' ? { targetLang } : {}),
  })

  if (result === null) {
    return Response.json({ error: 'ai_failed' }, { status: 502 })
  }

  // NEVER include the API key or provider URL in the response
  return Response.json({ result })
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  return Response.json({ enabled: isAiEnabled() })
}
